import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { Item } from '../types/Auction';
import type { AuthSocket } from './types';
import type { PreparedItem } from '../services/auctionService';
import { RoundTransition, timingLog, withTransition, type TimingContext } from '../logging/roundTiming';
import redisRoomHandler from '../RedisRooms/RoomHandler';

interface PreGameData {
    rounds: number;
    max_balance: number;
    item_data: Item;
    bid_options: number[];
}
interface Preparation {
    context: TimingContext;
    promise: Promise<PreparedItem | undefined>;
    prepared?: PreparedItem;
    consumed: boolean;
    activating: boolean;
    discarded: boolean;
}

// Runtime ownership also prevents two local loops preparing for the same room.
const games = new Map<string, () => void>();
export function cancelAbandonedGame(io: Server, roomId: string): void {
    if (!Array.from(io.sockets.sockets.values()).some(socket => socket.rooms.has(roomId))) games.get(roomId)?.();
}

async function handleBid(socket: AuthSocket, roomId: string, payload: unknown, io: Server): Promise<void> {
    try {
        const userid = socket.data.userid;
        if (!userid || socket.data.roomid !== roomId || !socket.rooms.has(roomId) ||
            !payload || typeof payload !== 'object' || !('bid' in payload)) return;
        const { bid } = payload as { bid: number };
        const data = await redisRoomHandler.handleBid(userid, bid, roomId);
        if (data.userid === userid && data.roomid === roomId) {
            io.to(roomId).emit('current bid', { bidder_id: userid, bid, bid_message: `I bid $${bid}, skibidi` });
        }
    } catch (error) {
        console.error(error);
    }
}

export async function handleGameLogic(io: Server, roomId: string): Promise<void> {
    if (games.has(roomId)) return;
    const gameId = randomUUID();
    const controller = new AbortController();
    const signal = controller.signal;
    const handlers = new Map<Socket, (payload: unknown) => void>();
    const bids = new Set<Promise<void>>();
    let active = true;
    let bidding = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Preparation | undefined;
    let initialUndelivered: Pick<PreparedItem, 'item'> | undefined;
    const contextFor = (round: number): TimingContext => ({ roomId, gameId, round, transitionId: randomUUID() });
    const initial = contextFor(1);

    const discardMedia = (prepared: Pick<PreparedItem, 'item'>, context: TimingContext) => {
        void redisRoomHandler.discardPreparedItem(prepared).catch(error => {
            timingLog('item.preparation.cleanup.failed', context, { errorType: error instanceof Error ? error.name : 'UnknownError' });
        });
    };
    const discardInitial = () => {
        if (!initialUndelivered) return;
        discardMedia(initialUndelivered, initial);
        initialUndelivered = undefined;
    };

    const discard = (preparation: Preparation) => {
        if (!preparation.prepared || preparation.consumed || preparation.activating || preparation.discarded) return;
        preparation.discarded = true;
        discardMedia(preparation.prepared, preparation.context);
    };
    const stop = (reason: string) => {
        if (!active) return;
        active = false;
        bidding = false;
        controller.abort();
        clearTimeout(timer);
        for (const [socket, handler] of handlers) socket.off('bid', handler);
        if (pending) discard(pending);
        discardInitial();
        timingLog('game.stopped', pending?.context ?? initial, { reason });
        games.delete(roomId);
    };
    games.set(roomId, () => stop('abandoned'));

    const beginPreparation = (round: number): Preparation => {
        const preparation: Preparation = {
            context: contextFor(round), consumed: false, activating: false, discarded: false,
            promise: Promise.resolve(undefined)
        };
        // Attach rejection handling immediately, even though the boundary is twenty seconds away.
        preparation.promise = redisRoomHandler.prepareItem(preparation.context, signal).then(prepared => {
            preparation.prepared = prepared;
            if (!active) discard(preparation);
            return prepared;
        }).catch(error => {
            if (active) {
                timingLog('game.preparation.failed', preparation.context, { errorType: error instanceof Error ? error.name : 'UnknownError' });
                stop('preparationFailed');
            }
            return undefined;
        });
        return preparation;
    };

    try {
        const data = JSON.parse(await redisRoomHandler.getPreGameData(roomId, signal, initial)) as PreGameData;
        initialUndelivered = { item: data.item_data };
        if (!active) { discardInitial(); return; }
        await redisRoomHandler.startGame(roomId);
        if (!active) return;
        io.to(roomId).emit('begin_game', { balance: data.max_balance, bidOptions: data.bid_options });

        const openItem = async (item: Item, round: number, context: TimingContext, trace?: RoundTransition, hadWinner = false): Promise<void> => {
            const refresh = () => redisRoomHandler.toggleUsersActiveStatus(roomId);
            const users = trace ? await trace.measure('presenceRefresh', refresh) : await refresh();
            if (!active) return;
            io.to(roomId).emit('user list', { userlist: users });
            for (const socket of io.sockets.sockets.values()) {
                if (!socket.rooms.has(roomId) || handlers.has(socket)) continue;
                const handler = (payload: unknown) => {
                    if (!bidding) return;
                    const task = handleBid(socket as AuthSocket, roomId, payload, io);
                    bids.add(task);
                    void task.finally(() => bids.delete(task));
                };
                handlers.set(socket, handler);
                socket.on('bid', handler);
            }
            bidding = true;
            io.to(roomId).emit('setItem', JSON.stringify({ item, timer: 20, timing: context }));
            if (round === 1) initialUndelivered = undefined;
            trace?.complete(hadWinner); // Gap ends at delivery, not after background work.
            timer = setTimeout(() => { void finishRound(round); }, 20000);
            if (round < data.rounds) pending = beginPreparation(round + 1);
        };

        const finishRound = async (round: number): Promise<void> => {
            if (!active) return;
            bidding = false;
            const upcoming = pending;
            const final = round === data.rounds;
            const context = final ? contextFor(round) : upcoming?.context ?? contextFor(round + 1);
            const trace = new RoundTransition(context, round, final ? null : round + 1);
            if (!final && upcoming) {
                const boundaryAt = performance.now();
                const ready = Boolean(upcoming.prepared);
                timingLog('item.preparation.boundary', context, { ready });
                void upcoming.promise.then(prepared => {
                    if (prepared && active) timingLog('item.preparation.boundary.ready', context, {
                        remainingFromBoundaryMs: ready ? 0 : performance.now() - boundaryAt
                    });
                });
            }
            io.to(roomId).emit('round status', { state: final ? 'complete' : 'preparing', ...context });
            try {
                await withTransition(trace, async () => {
                    const settled = await trace.measure('settlement', async () => {
                        // A bid already accepted during this round finishes before settlement reads it.
                        await Promise.all(bids);
                        await redisRoomHandler.distributeItemDB(roomId);
                        return redisRoomHandler.logItem(roomId);
                    });
                    if (!active) return;
                    if (settled.userid) io.to(roomId).emit('updated_balance', settled);
                    if (final) {
                        trace.complete(Boolean(settled.userid));
                        stop('completed');
                        setTimeout(() => io.in(roomId).disconnectSockets(), 6000);
                        return;
                    }
                    if (!upcoming) throw new Error('Missing preparation for upcoming round');
                    const prepared = await trace.measure('preparationWait', () => upcoming.promise);
                    if (!active || !prepared) return;
                    upcoming.activating = true;
                    let item: Item;
                    try {
                        item = await trace.measure('activation', () => redisRoomHandler.activatePreparedItem(context, prepared, signal));
                        upcoming.consumed = true;
                    } finally {
                        upcoming.activating = false;
                        if (!active) discard(upcoming);
                    }
                    if (!active) return;
                    await openItem(item, round + 1, context, trace, Boolean(settled.userid));
                });
            } catch (error) {
                trace.fail(error);
                console.error('Round error:', error instanceof Error ? error.name : 'UnknownError');
                stop('roundFailed');
            }
        };

        await openItem(data.item_data, 1, initial);
    } catch (error) {
        console.error('Game logic error:', error instanceof Error ? error.name : 'UnknownError');
        stop('startupFailed');
    }
}
