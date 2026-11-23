import type Room from "../RedisRooms/Room";
import type { RedisUser } from "../types/User";

interface RoomRedisClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    del(key: string): Promise<unknown>;
    lPop(key: string): Promise<string | null>;
    lPush(key: string, value: string): Promise<unknown>;
}

type StoredUser = RedisUser & { userid?: string };

export class RoomRepository {
    constructor(private readonly client: RoomRedisClient) {}

    async findRoom(roomId: string | null): Promise<Room | null> {
        return this.findRoomByKey(`room:${roomId}`);
    }

    async getRoom(roomId: string): Promise<Room> {
        const room = await this.findRoom(roomId);
        if (room === null) {
            throw new Error(`Room ${roomId} not found`);
        }
        return room;
    }

    async findRoomByKey(key: string): Promise<Room | null> {
        const room = await this.client.get(key);
        return room === null ? null : JSON.parse(room) as Room;
    }

    async saveRoom(roomId: string, room: Room): Promise<void> {
        await this.client.set(`room:${roomId}`, JSON.stringify(room));
    }

    async deleteRoom(roomId: string): Promise<void> {
        await this.client.del(`room:${roomId}`);
    }

    async findUser(userId: string): Promise<StoredUser | null> {
        const user = await this.client.get(`user:${userId}`);
        return user === null ? null : JSON.parse(user) as StoredUser;
    }

    async userExists(userId: string): Promise<boolean> {
        return await this.client.get(`user:${userId}`) !== null;
    }

    async getUser(userId: string): Promise<StoredUser> {
        const user = await this.findUser(userId);
        if (user === null) {
            throw new Error(`User ${userId} not found`);
        }
        return user;
    }

    async saveUser(userId: string, user: RedisUser): Promise<void> {
        await this.client.set(`user:${userId}`, JSON.stringify(user));
    }

    async deleteUser(userId: string): Promise<void> {
        await this.client.del(`user:${userId}`);
    }

    async popRoomQueue(auctionName: string): Promise<string | null> {
        return this.client.lPop(`rooms:${auctionName}`);
    }

    async pushRoomQueue(auctionName: string, entry: string): Promise<void> {
        await this.client.lPush(`rooms:${auctionName}`, entry);
    }
}
