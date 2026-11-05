import crypto from "crypto";
import ItemModel from "../models/Item";
import User from "../models/User";
import { RoomRepository } from "../repositories/roomRepository";

export class RewardService {
    constructor(private readonly rooms: RoomRepository) {}

    async distributeItemDB(roomId: string): Promise<void> {
        try {
            const room = await this.rooms.getRoom(roomId);
            if (room.itemData === null) {
                throw new Error(`Item data of room ${roomId} not found`);
            }
            const {
                name, value, description, img_url, audio_url, bidder_id, bid, rarity
            } = room.itemData;
            if (bidder_id === null) {
                return;
            }
            if (bid === null) {
                throw new Error("Bid is missing");
            }

            const hashcode = crypto.createHash("sha256").update(name + bidder_id).digest("hex");
            const existingItem = await ItemModel.findOne({ hashcode });
            if (existingItem) {
                await ItemModel.findOneAndUpdate({ hashcode }, { $inc: { amount: 1 } });
            } else {
                const newItem = new ItemModel({
                    hashcode, name, value, img_url, audio_url, description, bid,
                    amount: 1, owner: bidder_id, rarity
                });
                await newItem.save();
            }
            await User.findByIdAndUpdate(bidder_id, { $inc: { balance: -1 * bid } });
        } catch (error) {
            console.error("Error distributing item: ", error);
        }
    }

    async logItem(roomId: string): Promise<{ balance: number | null; userid: string | null }> {
        try {
            const room = await this.rooms.getRoom(roomId);
            const item = room.itemData;
            if (item === null) {
                throw new Error(`Item data of room ${roomId} not found`);
            }
            const userId: string | null = item.bidder_id;
            if (userId === null) {
                return { balance: null, userid: null };
            }
            const user = await this.rooms.getUser(userId);
            user.balance -= item.bid;
            item.bidder_id = "";
            item.bid = 0;
            await this.rooms.saveRoom(roomId, room);
            await this.rooms.saveUser(userId, user);
            console.log("balance: ", user.balance);
            console.log("userid: ", userId);
            return { balance: user.balance, userid: userId };
        } catch (error) {
            console.error("Error awarding item ", error);
            throw error;
        }
    }
}
