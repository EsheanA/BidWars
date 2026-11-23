import { getAuction } from "../auctions/auctionIndex";
import { RoomRepository } from "../repositories/roomRepository";
import type { GrokItemResponse, Item } from "../types/Auction";
import { prepareMedia, type PreparationSource } from './itemPreparation';
import type { TimingContext } from '../logging/roundTiming';

type ItemGenerator = (auctionIndex: number, signal?: AbortSignal) => Promise<string>;

export interface PreparedItem extends TimingContext {
    auctionIndex: number;
    item: Item;
}

function toItem({ item, rarity, audio_url, img_url }: GrokItemResponse): Item {
    return {
        name: item.item_name, value: item.item_value, bid: item.starting_bid,
        range: item.item_guessing_range, description: item.item_description,
        audio_url, img_url, bidder_id: '', rarity
    };
}

export class AuctionService {
    constructor(
        private readonly rooms: RoomRepository,
        private readonly generateItem: ItemGenerator,
        private readonly source?: PreparationSource
    ) {}

    async handleBid(
        userId: string,
        bid: number,
        expectedRoomId: string
    ): Promise<{ userid: string; bid: number; roomid: string }> {
        try {
            const user = await this.rooms.getUser(userId);
            if (user.roomid !== expectedRoomId) throw new Error("Not authorized for this room");
            const room = await this.rooms.getRoom(expectedRoomId);
            if (!room.users.some(participant => participant.userid === userId)) {
                throw new Error("Not a participant in this room");
            }
            if (room.itemData === null) {
                throw new Error("Current item data could not be found");
            }
            if (user.balance >= bid && user.active) {
                room.itemData.bid = bid;
                console.log("latest bid: ", room.itemData.bid);
                room.itemData.bidder_id = userId;
                await this.rooms.saveRoom(user.roomid, room);
                return { userid: userId, bid, roomid: user.roomid };
            }
            return { userid: "", bid, roomid: "" };
        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error handling user bid: ${error.message}`);
                throw `Error handling user bid: ${error.message}`;
            }
            throw "Error handling user bid";
        }
    }

    async getPreGameData(roomId: string, signal?: AbortSignal, context?: TimingContext): Promise<string> {
        try {
            await this.setItem(roomId, signal, context);
            const room = await this.rooms.getRoom(roomId);
            const auction = getAuction(room.auctionIndex);
            return JSON.stringify({
                rounds: room.rounds,
                item_data: room.itemData,
                max_balance: auction.value_range[1],
                bid_options: room.bid_options
            });
        } catch (error) {
            console.error('Error getting pregame data:', error instanceof Error ? error.name : 'UnknownError');
            throw error;
        }
    }

    async setItem(roomId: string, signal?: AbortSignal, context?: TimingContext): Promise<Item> {
        let generated: GrokItemResponse | undefined;
        let installed = false;
        try {
            signal?.throwIfAborted();
            const room = await this.rooms.getRoom(roomId);
            getAuction(room.auctionIndex);
            generated = this.source && signal && context
                ? await prepareMedia(this.source, context, signal, () => this.requireRoom(roomId, false, room.auctionIndex))
                : JSON.parse(await (signal ? this.generateItem(room.auctionIndex, signal) : this.generateItem(room.auctionIndex))) as GrokItemResponse;
            signal?.throwIfAborted();
            const item = toItem(generated);
            const fresh = await this.rooms.getRoom(roomId);
            getAuction(fresh.auctionIndex);
            if (fresh.auctionIndex !== room.auctionIndex) throw new Error('Auction changed during preparation');
            signal?.throwIfAborted();
            fresh.itemData = item;
            await this.rooms.saveRoom(roomId, fresh);
            installed = true;
            return item;
        } catch (error) {
            if (generated && !installed) await this.source?.discardAudio(generated.audio_url);
            console.error("Error setting next item: ", roomId);
            throw error;
        }
    }

    async checkGameStarted(roomId: string): Promise<boolean> {
        try {
            const room = await this.rooms.getRoom(roomId);
            return room.in_progress;
        } catch (error) {
            console.error("Error checking if game started: ", error);
            throw error;
        }
    }

    async startGame(roomId: string): Promise<void> {
        try {
            const room = await this.rooms.getRoom(roomId);
            getAuction(room.auctionIndex);
            room.in_progress = true;
            await this.rooms.saveRoom(roomId, room);
        } catch (error) {
            console.error("Error starting game: ", error);
            throw error;
        }
    }

    async prepareItem(context: TimingContext, signal: AbortSignal): Promise<PreparedItem> {
        if (!this.source) throw new Error('Preparation source not configured');
        let auctionIndex: number | undefined;
        const data = await prepareMedia(this.source, context, signal, async () => {
            const index = await this.requireRoom(context.roomId, true, auctionIndex);
            auctionIndex = index;
            return index;
        });
        return { ...context, auctionIndex: auctionIndex!, item: toItem(data) };
    }

    async activatePreparedItem(context: TimingContext, prepared: PreparedItem, signal: AbortSignal): Promise<Item> {
        signal.throwIfAborted();
        if (context.gameId !== prepared.gameId || context.roomId !== prepared.roomId ||
            context.round !== prepared.round || context.transitionId !== prepared.transitionId) {
            throw new Error('Prepared item does not belong to this game and round');
        }
        const room = await this.rooms.getRoom(context.roomId);
        getAuction(room.auctionIndex);
        if (!room.in_progress || room.users.length === 0 || room.auctionIndex !== prepared.auctionIndex) {
            throw new Error('Prepared item is no longer valid for this room');
        }
        signal.throwIfAborted();
        room.itemData = prepared.item;
        await this.rooms.saveRoom(context.roomId, room);
        return prepared.item;
    }

    async discardPreparedItem(prepared: Pick<PreparedItem, 'item'>): Promise<void> {
        await this.source?.discardAudio(prepared.item.audio_url);
    }

    private async requireRoom(roomId: string, started: boolean, expectedIndex?: number): Promise<number> {
        const room = await this.rooms.findRoom(roomId);
        if (!room || (started && !room.in_progress) || room.users.length === 0) {
            throw new DOMException('Game no longer active', 'AbortError');
        }
        getAuction(room.auctionIndex);
        if (expectedIndex !== undefined && expectedIndex !== room.auctionIndex) {
            throw new DOMException('Auction changed during preparation', 'AbortError');
        }
        return room.auctionIndex;
    }
}
