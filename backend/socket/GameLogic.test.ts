import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { room, item, user, socket, socketServer } from '../test-support/fixtures';
vi.mock('../RedisRooms/RoomHandler', () => ({ default: {
        initClient: vi.fn(), getPreGameData: vi.fn(), startGame: vi.fn(), toggleUsersActiveStatus: vi.fn(), handleBid: vi.fn(), distributeItemDB: vi.fn(), logItem: vi.fn(), setItem: vi.fn(), prepareItem: vi.fn(), activatePreparedItem: vi.fn(), discardPreparedItem: vi.fn(), getUser: vi.fn(), toggleSingleUserActiveStatus: vi.fn(), findRoom: vi.fn(), getUsers: vi.fn(), checkWhetherFull: vi.fn(), checkGameStarted: vi.fn(), kickUser: vi.fn(), deleteRoom: vi.fn(), userExist: vi.fn()
    } }));
import handler from '../RedisRooms/RoomHandler';
const h = vi.mocked(handler);
import { handleGameLogic, cancelAbandonedGame, stopAllGames } from './GameLogic';
import { AuctionService } from '../services/auctionService';
import { RewardService } from '../services/rewardService';
import { generated, repository, deferred } from '../test-support/fixtures';
import ItemModel from '../models/Item';
import UserModel from '../models/User';
let f: ReturnType<typeof socketServer>;
beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    f = socketServer();
    h.getPreGameData.mockResolvedValue(JSON.stringify({
        rounds: 3, max_balance: 250, item_data: item, bid_options: [5, 10, 20]
    }));
    h.startGame.mockResolvedValue();
    h.toggleUsersActiveStatus.mockResolvedValue(room().users);
    h.prepareItem.mockImplementation(async context => ({ ...context, auctionIndex: 0, item: { ...item, name: 'Next' } }));
    h.activatePreparedItem.mockImplementation(async (_context, prepared) => prepared.item);
    h.discardPreparedItem.mockResolvedValue();
    h.logItem.mockResolvedValue({ userid: 'alice', balance: 225 });
    h.distributeItemDB.mockResolvedValue();
    h.handleBid.mockResolvedValue({ userid: 'alice', roomid: 'r1', bid: 50 });
});
afterEach(async () => {
    f.s.rooms.clear();
    cancelAbandonedGame(f.io as any, 'r1');
    await stopAllGames();
});
const start = () => handleGameLogic(f.io as any, 'r1');
const tick = () => vi.advanceTimersByTimeAsync(20000);
const events = (name: string) => f.io.events.filter(e => e.event === name);
describe("handleGameLogic", () => {
    describe("game and round progression", () => {
        it("should publish the active player list and current item with a twenty-second round timer", async () => {
            await start();
            expect(events('user list')[0]!.data).toEqual({ userlist: room().users });
            expect(JSON.parse(events('setItem')[0]!.data)).toMatchObject({ item, timer: 20 });
        });
        it("should start preparing during bidding and activate the existing result at the boundary", async () => {
            await start();
            expect(h.prepareItem).toHaveBeenCalledOnce();
            expect(h.activatePreparedItem).not.toHaveBeenCalled();
            await tick();
            expect(JSON.parse(events('setItem')[1]!.data).item.name).toBe('Next');
            expect(h.activatePreparedItem).toHaveBeenCalledOnce();
            expect(h.prepareItem).toHaveBeenCalledTimes(2);
            expect(h.activatePreparedItem.mock.calls[0]![0]).toEqual(h.prepareItem.mock.calls[0]![0]);
        });
        it("should leave the current round open until its timer expires", async () => {
            await start();
            await vi.advanceTimersByTimeAsync(19999);
            expect(h.logItem).not.toHaveBeenCalled();
            expect(events('setItem')).toHaveLength(1);
        });
        it("should settle each completed round including the final round before moving on", async () => {
            await start();
            await tick();
            await tick();
            await tick();
            expect(h.distributeItemDB).toHaveBeenCalledTimes(3);
            expect(h.logItem).toHaveBeenCalledTimes(3);
            expect(h.distributeItemDB.mock.invocationCallOrder[0]).toBeLessThan(h.logItem.mock.invocationCallOrder[0]!);
        });
        it("should broadcast the winner's updated balance after settlement", async () => {
            await start();
            await tick();
            expect(events('updated_balance')[0]).toEqual({ room: 'r1', event: 'updated_balance', data: { userid: 'alice', balance: 225 } });
        });
        it("completes three no-bid rounds using real settlement without awarding or charging", async () => {
            const harness = repository();
            const generate = vi.fn(async () => JSON.stringify(generated));
            const auctions = new AuctionService(harness.dependency, generate, {
                generateDraft: vi.fn(async () => { generate(); return generated; }),
                generateAudio: vi.fn(async () => generated.audio_url), discardAudio: vi.fn(async () => {})
            });
            const rewards = new RewardService(harness.dependency);
            const inventoryLookup = vi.spyOn(ItemModel, 'findOne').mockRejectedValue(new Error('Unexpected inventory lookup'));
            const charge = vi.spyOn(UserModel, 'findByIdAndUpdate').mockRejectedValue(new Error('Unexpected charge'));
            h.getPreGameData.mockImplementation(auctions.getPreGameData.bind(auctions));
            h.startGame.mockImplementation(auctions.startGame.bind(auctions));
            h.prepareItem.mockImplementation(auctions.prepareItem.bind(auctions));
            h.activatePreparedItem.mockImplementation(auctions.activatePreparedItem.bind(auctions));
            h.discardPreparedItem.mockImplementation(auctions.discardPreparedItem.bind(auctions));
            h.distributeItemDB.mockImplementation(rewards.distributeItemDB.bind(rewards));
            h.logItem.mockImplementation(rewards.logItem.bind(rewards));

            await start();
            await tick();
            expect(events('setItem')).toHaveLength(2);
            await tick();
            await tick();

            expect(events('setItem')).toHaveLength(3);
            expect(generate).toHaveBeenCalledTimes(3);
            expect(events('updated_balance')).toEqual([]);
            expect(harness.users.get('alice')!.balance).toBe(250);
            expect(inventoryLookup).not.toHaveBeenCalled();
            expect(charge).not.toHaveBeenCalled();
            expect(harness.api.getUser).not.toHaveBeenCalled();
            expect(harness.api.saveUser).not.toHaveBeenCalled();
            expect(f.disconnected).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(6000);
            expect(f.disconnected).toHaveBeenCalledOnce();
            expect(vi.getTimerCount()).toBe(0);
            expect(console.error).not.toHaveBeenCalled();
        });
        it("should finish after the configured number of rounds without generating an extra item", async () => {
            await start();
            await tick();
            await tick();
            await tick();
            expect(events('setItem')).toHaveLength(3);
            expect(h.prepareItem).toHaveBeenCalledTimes(2);
        });
        it("should disconnect only that room's sockets after the six-second game-over delay", async () => {
            await start();
            await tick();
            await tick();
            await tick();
            await vi.advanceTimersByTimeAsync(5999);
            expect(f.disconnected).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(f.io.in).toHaveBeenCalledWith('r1');
            expect(f.disconnected).toHaveBeenCalledOnce();
        });
    });
    describe("bid events", () => {
        it("should broadcast accepted bids only to the room returned by the auction service", async () => {
            await start();
            await f.s.handlers.get('bid')!({ userid: 'alice', bid: 50 });
            await Promise.resolve();
            expect(events('current bid')[0]).toMatchObject({ room: 'r1', data: { bidder_id: 'alice', bid: 50 } });
        });
        it("should avoid broadcasting rejected bids or bids whose handling fails", async () => {
            await start();
            h.handleBid.mockResolvedValueOnce({ userid: '', roomid: '', bid: 50 });
            f.s.handlers.get('bid')!({ userid: 'alice', bid: 50 });
            await vi.advanceTimersByTimeAsync(0);
            h.handleBid.mockRejectedValueOnce(new Error('offline'));
            f.s.handlers.get('bid')!({ userid: 'alice', bid: 50 });
            await vi.advanceTimersByTimeAsync(0);
            expect(events('current bid')).toEqual([]);
        });
        it("should ignore sockets outside the current game room when registering bidding handlers", async () => {
            await start();
            expect(f.other.handlers.has('bid')).toBe(false);
            expect(f.s.handlers.has('bid')).toBe(true);
        });
        it("should process one bid only once after advancing through multiple rounds", async () => {
            await start();
            await tick();
            await tick();
            f.s.handlers.get('bid')!({ userid: 'alice', bid: 50 });
            await vi.advanceTimersByTimeAsync(0);
            expect(h.handleBid).toHaveBeenCalledOnce();
        });
    });
    describe("dependency failures", () => {
        it("should avoid opening a round when pregame data cannot be loaded or parsed", async () => {
            for (const invalid of ['failure', 'json']) {
                h.getPreGameData.mockImplementationOnce(async () => {
                    if (invalid === 'failure')
                        throw new Error('offline');
                    return 'bad json';
                });
                await start();
            }
            expect(events('setItem')).toEqual([]);
            expect(vi.getTimerCount()).toBe(0);
        });
        it("should stop progression when startup fails or preparation cannot continue", async () => {
            h.startGame.mockRejectedValueOnce(new Error('offline'));
            await start();
            expect(events('setItem')).toHaveLength(0);
            h.prepareItem.mockRejectedValueOnce(new Error('preparation cancelled'));
            await start();
            await tick();
            expect(events('setItem')).toHaveLength(1);
            expect(vi.getTimerCount()).toBe(0);
        });
        it("should stop advancing the round when settlement rejects", async () => {
            await start();
            h.logItem.mockRejectedValueOnce(new Error('offline'));
            await tick();
            expect(events('setItem')).toHaveLength(1);
            expect(vi.getTimerCount()).toBe(0);
        });
        it("should handle failed player-status refreshes without an unhandled rejection", async () => {
            h.toggleUsersActiveStatus.mockRejectedValueOnce(new Error('offline'));
            await expect(start()).resolves.toBeUndefined();
            expect(events('setItem')).toEqual([]);
            expect(vi.getTimerCount()).toBe(0);
        });
    });
});
it('starts the game and announces its initial bidding state before opening the round', async () => {
    await start();
    expect(events('begin_game')).toEqual([{ room: 'r1', event: 'begin_game', data: { balance: 250, bidOptions: [5, 10, 20] } }]);
    expect(h.startGame.mock.invocationCallOrder[0]).toBeLessThan(h.toggleUsersActiveStatus.mock.invocationCallOrder[0]!);
});

it('ignores a forged bidder ID and attributes the bid to the authenticated socket', async () => {
    await start();
    await f.s.handlers.get('bid')!({userid: 'victim', bid: 50});
    await vi.advanceTimersByTimeAsync(0);
    expect(h.handleBid).toHaveBeenCalledExactlyOnceWith('alice', 50, 'r1');
    expect(events('current bid')).toEqual([expect.objectContaining({room: 'r1', data: expect.objectContaining({bidder_id: 'alice'})})]);
});
it.each(['no identity', 'wrong bound room', 'left room'])('rejects a bid with %s before calling the auction service', async reason => {
    await start();
    if (reason === 'no identity') f.s.data.userid = '';
    if (reason === 'wrong bound room') f.s.data.roomid = 'other';
    if (reason === 'left room') f.s.rooms.delete('r1');
    await f.s.handlers.get('bid')!({userid: 'alice', bid: 50});
    await vi.advanceTimersByTimeAsync(0);
    expect(h.handleBid).not.toHaveBeenCalled();
    expect(events('current bid')).toEqual([]);
});

it('continues accepting authorized bids during preparation, then waits for the same operation with bidding closed', async () => {
    const next = deferred<Awaited<ReturnType<typeof handler.prepareItem>>>();
    h.prepareItem.mockReturnValueOnce(next.promise);
    await start();
    await f.s.handlers.get('bid')!({ bid: 50 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.handleBid).toHaveBeenCalledOnce();
    await tick();
    expect(h.logItem).toHaveBeenCalledOnce();
    expect(h.activatePreparedItem).not.toHaveBeenCalled();
    expect(events('setItem')).toHaveLength(1);
    expect(events('round status')[0]!.data.state).toBe('preparing');
    expect(h.prepareItem).toHaveBeenCalledOnce();
    await f.s.handlers.get('bid')!({ bid: 75 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.handleBid).toHaveBeenCalledOnce();
    const context = h.prepareItem.mock.calls[0]![0];
    next.resolve({ ...context, auctionIndex: 0, item: { ...item, name: 'Prepared' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(events('setItem')).toHaveLength(2);
    expect(h.prepareItem).toHaveBeenCalledTimes(2); // Only now prepare round three.
    expect(h.activatePreparedItem).toHaveBeenCalledOnce();
    expect(h.logItem.mock.invocationCallOrder[0]).toBeLessThan(h.activatePreparedItem.mock.invocationCallOrder[0]!);
    expect(JSON.parse(events('setItem')[1]!.data)).toMatchObject({ timing: context, item: { name: 'Prepared' } });
});

it.each(['ready', 'pending'])('cancels %s preparation when the last socket leaves and discards unused media', async state => {
    const next = deferred<Awaited<ReturnType<typeof handler.prepareItem>>>();
    if (state === 'pending') h.prepareItem.mockReturnValueOnce(next.promise);
    await start();
    const [context, signal] = h.prepareItem.mock.calls[0]!;
    f.s.rooms.delete('r1');
    cancelAbandonedGame(f.io as any, 'r1');
    next.resolve({ ...context, auctionIndex: 0, item });
    await vi.advanceTimersByTimeAsync(60000);
    expect(signal.aborted).toBe(true);
    expect(h.discardPreparedItem).toHaveBeenCalledOnce();
    expect(h.activatePreparedItem).not.toHaveBeenCalled();
    expect(h.logItem).not.toHaveBeenCalled();
    expect(events('setItem')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
});

it('keeps preparation running when another participant remains connected', async () => {
    await start();
    f.other.rooms.add('r1');
    f.s.rooms.delete('r1');
    cancelAbandonedGame(f.io as any, 'r1');
    expect(h.prepareItem.mock.calls[0]![1].aborted).toBe(false);
    await tick();
    expect(events('setItem')).toHaveLength(2);
    f.other.rooms.delete('r1');
});

it('does not start duplicate local game loops or background requests for a room', async () => {
    await start();
    await start();
    expect(h.getPreGameData).toHaveBeenCalledOnce();
    expect(h.prepareItem).toHaveBeenCalledOnce();
    expect(events('setItem')).toHaveLength(1);
});

it('cancels first-item startup when everyone leaves before it finishes', async () => {
    const first = deferred<string>();
    h.getPreGameData.mockReturnValueOnce(first.promise);
    const task = start();
    f.s.rooms.delete('r1');
    cancelAbandonedGame(f.io as any, 'r1');
    first.resolve(JSON.stringify({ rounds: 3, item_data: item }));
    await task;
    expect(h.getPreGameData.mock.calls[0]![1]!.aborted).toBe(true);
    expect(h.startGame).not.toHaveBeenCalled();
    expect(events('setItem')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
});

it('finishes an already accepted bid before reading the item for settlement', async () => {
    const bid = deferred<{ userid: string; roomid: string; bid: number }>();
    h.handleBid.mockReturnValueOnce(bid.promise);
    await start();
    f.s.handlers.get('bid')!({ bid: 50 });
    await tick();
    expect(h.distributeItemDB).not.toHaveBeenCalled();
    bid.resolve({ userid: 'alice', roomid: 'r1', bid: 50 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.logItem).toHaveBeenCalledOnce();
    expect(events('setItem')).toHaveLength(2);
});

it('stops all active games and waits for unused media cleanup before completing shutdown', async () => {
    await start();
    const second = socketServer();
    second.s.rooms = new Set(['r2']);
    await handleGameLogic(second.io as any, 'r2');
    const cleanup = deferred<void>();
    h.discardPreparedItem.mockReturnValueOnce(cleanup.promise);
    let drained = false;
    const stopping = stopAllGames().then(() => { drained = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.prepareItem.mock.calls).toHaveLength(2);
    expect(h.prepareItem.mock.calls.every(([, signal]) => signal.aborted)).toBe(true);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"reason":"shutdown"'));
    expect(drained).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    cleanup.resolve(); await stopping;
    expect(drained).toBe(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(events('setItem')).toHaveLength(1);
    expect(second.io.events.filter(event => event.event === 'setItem')).toHaveLength(1);
    expect(h.logItem).not.toHaveBeenCalled();
});

it('waits for a preparation finishing after shutdown and discards its result without activation', async () => {
    const next = deferred<Awaited<ReturnType<typeof handler.prepareItem>>>();
    h.prepareItem.mockReturnValueOnce(next.promise);
    await start();
    let drained = false;
    const stopping = stopAllGames().then(() => { drained = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(false);
    next.resolve({ ...h.prepareItem.mock.calls[0]![0], auctionIndex: 0, item });
    await stopping;
    expect(h.discardPreparedItem).toHaveBeenCalledOnce();
    expect(h.activatePreparedItem).not.toHaveBeenCalled();
    expect(drained).toBe(true);
});

it('clears the delayed game-over disconnect during server shutdown', async () => {
    await start(); await tick(); await tick(); await tick();
    expect(vi.getTimerCount()).toBe(1);
    await stopAllGames();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.disconnected).not.toHaveBeenCalled();
});

it('drains an accepted bid before completing server shutdown', async () => {
    const bid = deferred<{ userid: string; roomid: string; bid: number }>();
    h.handleBid.mockReturnValueOnce(bid.promise);
    await start();
    f.s.handlers.get('bid')!({ bid: 50 });
    let drained = false;
    const stopping = stopAllGames().then(() => { drained = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(false);
    bid.resolve({ userid: 'alice', roomid: 'r1', bid: 50 });
    await stopping;
    expect(drained).toBe(true);
    expect(h.logItem).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
});

it('lets settlement already in progress finish without opening another round during shutdown', async () => {
    const settlement = deferred<{ userid: string; balance: number }>();
    h.logItem.mockReturnValueOnce(settlement.promise);
    await start(); await tick();
    let drained = false;
    const stopping = stopAllGames().then(() => { drained = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(false);
    settlement.resolve({ userid: 'alice', balance: 225 });
    await stopping;
    expect(drained).toBe(true);
    expect(h.activatePreparedItem).not.toHaveBeenCalled();
    expect(events('setItem')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
});
