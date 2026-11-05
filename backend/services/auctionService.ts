import type Room from "../RedisRooms/Room";
import { getAuction } from "../auctions/auctionIndex";
import { RoomRepository } from "../repositories/roomRepository";
import type { GrokItemResponse, Item } from "../types/Auction";

type ItemGenerator = (auctionIndex: number) => Promise<string>;

export class AuctionService {
    constructor(
        private readonly rooms: RoomRepository,
        private readonly generateItem: ItemGenerator
    ) {}

    async handleBid(
        userId: string,
        bid: number
    ): Promise<{ userid: string; bid: number; roomid: string }> {
        try {
            const user = await this.rooms.getUser(userId);
            const room = await this.rooms.getRoom(user.roomid);
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

    async getPreGameData(roomId: string): Promise<string> {
        try {
            const room = await this.rooms.getRoom(roomId);
            const auction = getAuction(room.auctionIndex);
            await this.generateRoomItem(roomId, room);
            return JSON.stringify({
                rounds: room.rounds,
                item_data: room.itemData,
                max_balance: auction.value_range[1],
                bid_options: room.bid_options
            });
        } catch (error) {
            console.error("Error getting pregame data: ", error);
            throw error;
        }
    }

    async setItem(roomId: string): Promise<Item> {
        try {
            const room = await this.rooms.getRoom(roomId);
            return await this.generateRoomItem(roomId, room);
        } catch (error) {
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

    private async generateRoomItem(roomId: string, room: Room): Promise<Item> {
        getAuction(room.auctionIndex);
        const data = await this.generateItem(room.auctionIndex);
        const { item, rarity, audio_url, img_url } = JSON.parse(data) as GrokItemResponse;
        room.itemData = {
            name: item.item_name,
            value: item.item_value,
            bid: item.starting_bid,
            range: item.item_guessing_range,
            description: item.item_description,
            audio_url,
            img_url,
            bidder_id: "",
            rarity
        };
        await this.rooms.saveRoom(roomId, room);
        return room.itemData;
    }
}
