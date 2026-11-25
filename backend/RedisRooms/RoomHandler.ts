import { createClient } from "redis";
import dotenv from "dotenv";
import callGrok, { generateDraft, generateAudio, discardAudio } from "../itemGeneration/grok";
import { RoomRepository } from "../repositories/roomRepository";
import { RoomService } from "../services/roomService";
import { AuctionService } from "../services/auctionService";
import { RewardService } from "../services/rewardService";

dotenv.config();

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
    throw new Error("REDIS_URL is undefined");
}

const client = createClient({ url: redisUrl });
client.on("connect", async () => {
    console.log("RedisRoomHandler connected to Redis");
});
client.on("error", (error: Error) => {
    console.error("Redis error", error);
});

const repository = new RoomRepository(client);
const rooms = new RoomService(repository);
const auctions = new AuctionService(repository, callGrok, { generateDraft, generateAudio, discardAudio });
const rewards = new RewardService(repository);

// Keep the existing socket API while each service owns its own behavior.
const redisRoomHandler = {
    async initClient(): Promise<void> {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                client.connect(),
                new Promise<never>((_, reject) => {
                    timeout = setTimeout(() => {
                        if (client.isOpen) client.destroy();
                        reject(new Error('Redis startup timed out'));
                    }, 10000);
                })
            ]);
        } finally {
            clearTimeout(timeout);
        }
    },
    async closeClient(force = false): Promise<void> {
        if (!client.isOpen) return;
        if (force || !client.isReady) client.destroy();
        else await client.close();
    },
    getUser: rooms.getUser.bind(rooms),
    userExist: rooms.userExist.bind(rooms),
    findRoom: rooms.findRoom.bind(rooms),
    toggleUsersActiveStatus: rooms.toggleUsersActiveStatus.bind(rooms),
    toggleSingleUserActiveStatus: rooms.toggleSingleUserActiveStatus.bind(rooms),
    setUsersToActive: rooms.setUsersToActive.bind(rooms),
    getUserActiveStatus: rooms.getUserActiveStatus.bind(rooms),
    getUsers: rooms.getUsers.bind(rooms),
    checkWhetherFull: rooms.checkWhetherFull.bind(rooms),
    kickUser: rooms.kickUser.bind(rooms),
    deleteRoom: rooms.deleteRoom.bind(rooms),
    handleBid: auctions.handleBid.bind(auctions),
    getPreGameData: auctions.getPreGameData.bind(auctions),
    setItem: auctions.setItem.bind(auctions),
    prepareItem: auctions.prepareItem.bind(auctions),
    activatePreparedItem: auctions.activatePreparedItem.bind(auctions),
    discardPreparedItem: auctions.discardPreparedItem.bind(auctions),
    checkGameStarted: auctions.checkGameStarted.bind(auctions),
    startGame: auctions.startGame.bind(auctions),
    distributeItemDB: rewards.distributeItemDB.bind(rewards),
    logItem: rewards.logItem.bind(rewards)
};

export default redisRoomHandler;
