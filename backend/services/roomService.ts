import Room from "../RedisRooms/Room";
import auctionData from "../auctions/auctionz.json";
import { RoomRepository } from "../repositories/roomRepository";
import type { Auction } from "../types/Auction";
import type { RedisUser, RoomUser } from "../types/User";

export class RoomService {
    constructor(private readonly rooms: RoomRepository) {}

    async getUser(userId: string): Promise<RedisUser> {
        try {
            return await this.rooms.getUser(userId);
        } catch (error) {
            console.error("Error getting user info: ", error);
            throw error;
        }
    }

    async userExist(userId: string): Promise<boolean> {
        try {
            return await this.rooms.userExists(userId);
        } catch (error) {
            console.error("Error getting user info: ", error);
            return false;
        }
    }

    async findRoom(userId: string, username: string, auctionIndex: number): Promise<string> {
        try {
            const auctions = auctionData.auctions.mainline_auctions as Auction[];
            const auctionName = auctions[auctionIndex]?.name as string;
            const balance = auctions[auctionIndex]?.value_range[1] as number;
            const queuedRoomId = await this.rooms.popRoomQueue(auctionName);
            const room = await this.rooms.findRoom(queuedRoomId);

            if (room === null) {
                return await this.createRoom(userId, username, auctionName, auctionIndex, balance);
            }

            if (room.max || room.in_progress) {
                // Preserve the existing queue payload for unavailable rooms.
                await this.rooms.pushRoomQueue(auctionName, JSON.stringify(room));
                return await this.createRoom(userId, username, auctionName, auctionIndex, balance);
            }

            room.users.push({ userid: userId, username, active: true });
            if (room.limit === room.users.length) {
                room.max = true;
            }
            await this.rooms.saveRoom(room.id, room);
            await this.rooms.saveUser(userId, this.createUser(room.id, username, balance));
            await this.rooms.pushRoomQueue(auctionName, room.id);
            return room.id;
        } catch (error) {
            console.error("Error finding room: ", error);
            throw error;
        }
    }

    async toggleUsersActiveStatus(roomId: string): Promise<RoomUser[]> {
        try {
            const room = await this.rooms.getRoom(roomId);
            for (const roomUser of room.users) {
                const user = await this.rooms.findUser(roomUser.userid);
                if (user === null) {
                    await this.kickUser(roomUser.userid, roomId);
                    throw new Error(`User ${roomUser.userid} not found`);
                }
                if (user.active) {
                    roomUser.active = true;
                }
            }
            await this.rooms.saveRoom(roomId, room);
            return room.users;
        } catch (error) {
            if (error instanceof Error) {
                throw `Error in setting active status of users in the room: ${error.message}`;
            }
            throw "Error in setting active status of users in the room";
        }
    }

    async toggleSingleUserActiveStatus(userId: string): Promise<void> {
        try {
            const user = await this.rooms.getUser(userId);
            user.active = !user.active;
            const room = await this.rooms.getRoom(user.roomid);
            if (!user.active) {
                room.users.forEach((roomUser) => {
                    if (roomUser.userid === user.userid) {
                        roomUser.active = !roomUser.active;
                    }
                });
                await this.rooms.saveRoom(user.roomid, room);
            }
            await this.rooms.saveUser(userId, user);
        } catch (error) {
            if (error instanceof Error) {
                throw `Error in setting user active status: ${error.message}`;
            }
            throw "Error in setting user active status";
        }
    }

    async setUsersToActive(roomId: string): Promise<void> {
        try {
            // This legacy helper reads an unprefixed key; retain its current behavior.
            const room = await this.rooms.findRoomByKey(roomId);
            if (room === null) {
                throw new Error(`Room ${roomId} not found`);
            }
            for (const roomUser of room.users) {
                const user = await this.rooms.getUser(roomUser.userid);
                roomUser.active = true;
                user.active = true;
                await this.rooms.saveUser(roomUser.userid, user);
            }
            await this.rooms.saveRoom(roomId, room);
        } catch (error) {
            console.error("Error in setting user active status: ", error);
        }
    }

    async getUserActiveStatus(userId: string): Promise<boolean> {
        try {
            const user = await this.rooms.getUser(userId);
            return user.active;
        } catch (error) {
            console.error("Error getting user active status: ", error);
            throw error;
        }
    }

    async getUsers(roomId: string): Promise<RoomUser[]> {
        try {
            const room = await this.rooms.getRoom(roomId);
            return room.users || [];
        } catch (error) {
            console.error("Error fetching users: ", error);
            throw error;
        }
    }

    async checkWhetherFull(roomId: string): Promise<boolean> {
        try {
            const room = await this.rooms.getRoom(roomId);
            return room.max;
        } catch (error) {
            console.error("Error checking whether room is full or not: ", error);
            throw error;
        }
    }

    async kickUser(userId: string, currentRoomId: string): Promise<void> {
        try {
            const user = await this.rooms.findUser(userId);
            if (user === null) {
                console.log(`User ${userId} not found in Redis`);
                return;
            }
            if (currentRoomId === user.roomid) {
                const room = await this.rooms.getRoom(user.roomid);
                room.users = room.users.filter((roomUser) => roomUser.userid !== userId);
                await this.rooms.deleteUser(userId);
                await this.rooms.saveRoom(user.roomid, room);
            }
        } catch (error) {
            console.error("Error kicking user: ", error);
            throw error;
        }
    }

    async deleteRoom(roomId: string): Promise<void> {
        try {
            await this.rooms.deleteRoom(roomId);
        } catch (error) {
            console.error("Error deleting room: ", error);
        }
    }

    private createUser(roomId: string, username: string, balance: number): RedisUser {
        return { roomid: roomId, username, active: true, balance, items: [] };
    }

    private async createRoom(
        userId: string,
        username: string,
        auctionName: string,
        auctionIndex: number,
        balance: number
    ): Promise<string> {
        const room = new Room(auctionName, auctionIndex);
        room.users.push({ userid: userId, username, active: true });
        await this.rooms.saveRoom(room.id, room);
        await this.rooms.pushRoomQueue(auctionName, room.id);
        await this.rooms.saveUser(userId, this.createUser(room.id, username, balance));
        return room.id;
    }
}
