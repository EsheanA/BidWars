import { createClient, type RedisClientType } from "redis";
import Room from "./Room";
import callGrok from "../itemGeneration/grok";
import auctionData from "../auctions/auctionz.json";
import ItemModel from "../models/Item";
import User from "../models/User";
import crypto from "crypto";
import dotenv from "dotenv";
import { Responses } from "openai/resources";
import { type Auction, type GrokItemResponse } from '../types/Auction';
import { type RoomUser, type RedisUser } from "../types/User";
import { type Item } from "../types/Auction";
dotenv.config();


class RoomHandler {

    private static instance: RoomHandler;
    private client!: RedisClientType;

    constructor() {
        if (!RoomHandler.instance) {
            const redisUrl: string | undefined = process.env.REDIS_URL;

            if (!redisUrl) {
                throw new Error("REDIS_URL is undefined");
            }

            this.client = createClient({
                url: redisUrl,
            });

            this.client.on("connect", async () => {
                console.log("RedisRoomHandler connected to Redis");
                await this.client.flushDb();
                console.log("Redis database cleared successfully.");
            });

            this.client.on("error", (err: Error) => {
                console.error("Redis error", err);
            });

            RoomHandler.instance = this;
        }

        return RoomHandler.instance;
    }


    async getUser(userid: string): Promise<RedisUser> {
        try {
            const user: string | null = await this.client.get(`user:${userid}`);
    
            if (user === null) {
                throw new Error(`User ${userid} not found`);
            }
    
            const parsedUser = JSON.parse(user) as RedisUser;
            return Promise.resolve(parsedUser);
        } catch (error) {
            console.error("Error getting user info: ", error);
            throw error;
        }
    }
    //checks if a user exists in a room
    async userExist(userid: string): Promise<boolean> {
        try {
            const user: string | null = await this.client.get(`user:${userid}`);
    
            if (user === null) {
                return false;
            } else {
                return true;
            }
        } catch (error) {
            console.error("Error getting user info: ", error);
            return false;
        }
    }

    async initClient() : Promise<void> {
        try {
            await this.client.connect();
            return Promise.resolve();
        } catch (error) {
            console.error(error);
            return Promise.reject(error);
        }
    }


    async distributeItemDB(roomid: string): Promise<void> {
        try {
            const room: string | null = await this.client.get(`room:${roomid}`);
    
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
    
            const parsedRoom = JSON.parse(room) as Room;
            const itemData = parsedRoom.itemData;
            if(itemData === null)
                throw new Error(`Item data of room ${roomid} not found`);

            const {
                name,
                value,
                description,
                img_url,
                audio_url,
                bidder_id,
                bid,
                rarity
            } = itemData;
    
            if (bidder_id === null)
                return;
    
            if (bid === null)
                throw new Error("Bid is missing");
    
            const hashcode: string = crypto
                .createHash("sha256")
                .update(name + bidder_id)
                .digest("hex");
    
            const existingItem = await ItemModel.findOne({
                hashcode: hashcode
            });
    
            if (existingItem) {
                await ItemModel.findOneAndUpdate(
                    { hashcode: hashcode },
                    { $inc: { amount: 1 } }
                );
            } else {
                const newItem = new ItemModel({
                    hashcode: hashcode,
                    name,
                    value,
                    img_url,
                    audio_url,
                    description,
                    bid,
                    amount: 1,
                    owner: bidder_id,
                    rarity
                });
    
                await newItem.save();
            }
    
            await User.findByIdAndUpdate(
                bidder_id,
                { $inc: { balance: -1 * bid } }
            );
    
        } catch (error) {
            console.error("Error distributing item: ", error);
            return;
        }
    }

    async logItem(
        roomid: string
    ): Promise<{ balance: number | null; userid: string | null }> {
        try {
            const room: string | null = await this.client.get(`room:${roomid}`);
    
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
    
            const parsedRoom = JSON.parse(room) as Room;
            const itemData =  parsedRoom.itemData;
            if(itemData === null)
                throw new Error(`Item data of room ${roomid} not found`);
            const userid: string | null = itemData.bidder_id;
            
            if (userid !== null) {
                const user: string | null = await this.client.get(`user:${userid}`);
    
                if (user === null) {
                    throw new Error(`User ${userid} not found`);
                }
    
                const parsedUser = JSON.parse(user) as RedisUser;
    
                parsedUser.balance = parsedUser.balance - itemData.bid;
    
                // parsedRoom.items.push(currentItem);
                itemData.bidder_id = "";
                itemData.bid = 0;
    
                await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
                await this.client.set(`user:${userid}`, JSON.stringify(parsedUser));
    
                console.log("balance: ", parsedUser.balance);
                console.log("userid: ", userid);
    
                return Promise.resolve({
                    balance: parsedUser.balance,
                    userid
                });
            } else {
                return Promise.resolve({
                    balance: null,
                    userid: null
                });
            }
    
        } catch (error) {
            console.error("Error awarding item ", error);
            return Promise.reject(error);
        }
    }

    async handleBid(userid : string, bid : number) : Promise<{userid: string, bid: number, roomid: string}> {
        try {
            const user : string | null = await this.client.get(`user:${userid}`);
            if(user === null)
                throw new Error(`User ${userid} not found`);

            const parsedUser = JSON.parse(user) as RedisUser;
            const { roomid, active, balance } = parsedUser;
            const room : string | null = await this.client.get(`room:${roomid}`);
            if(room === null)
                throw new Error(`User ${roomid} not found`);

            const parsedRoom = JSON.parse(room) as Room;
            if(parsedRoom.itemData === null){
                throw new Error(`Current item data could not be found`);
            }
            if (balance >= bid && active) {
                parsedRoom.itemData.bid = bid;
                console.log("latest bid: ", parsedRoom.itemData.bid)
                parsedRoom.itemData.bidder_id = userid;
                await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom))
                return Promise.resolve(({ userid, bid, roomid }))
            }
            else {
                return Promise.resolve({ userid: "", bid, roomid: "" })
            }

        } catch (error : unknown) {
            if(error instanceof Error){
                console.error(`Error handling user bid: ${error.message}`)
                return Promise.reject(`Error handling user bid: ${error.message}`);
            }else{
                return Promise.reject("Error handling user bid");
            }
        }
    }

    async findRoom(userid : string, username : string, auctionIndex : number) : Promise<string>{
        try {
            const mainline_auctions =  auctionData.auctions.mainline_auctions as Array<Auction>;
            const auctionName = mainline_auctions[auctionIndex]?.name as string;
            const getMaxBalance = () : number => {
                return (mainline_auctions[auctionIndex]?.value_range[1] as number);
            }
            const max_balance = getMaxBalance();
            const validRoomID = await this.client.lPop(`rooms:${auctionName}`);
            const room = await this.client.get(`room:${validRoomID}`);
            if (room) {
                const parsedRoom = JSON.parse(room) as Room;
                //first check if room is full or in progress
                if (parsedRoom.max || parsedRoom.in_progress) {
                    await this.client.lPush(`rooms:${auctionName}`, JSON.stringify(parsedRoom));
                    const room = new Room(auctionName, auctionIndex);
                    room.users.push({ userid, username, active: true });
                    //setting key to room via its id && also pushing roomid to queue
                    await this.client.set(`room:${room.id}`, JSON.stringify(room));
                    await this.client.lPush(`rooms:${auctionName}`, room.id);
                    //giving user a reference to the roomid
                    const user : RedisUser = {
                        roomid: room.id,
                        username,
                        active: true,
                        balance: max_balance,
                        items: []
                    };
                    await this.client.set(`user:${userid}`, JSON.stringify(user));
                    return Promise.resolve(room.id);
                }
                //otherwise just add user to the room at the top of queue
                else {
                    const roomUser : RoomUser = { userid, username, active: true };
                    parsedRoom.users.push(roomUser);
                    if (parsedRoom.limit === parsedRoom.users.length)
                        parsedRoom.max = true;
                    await this.client.set(`room:${parsedRoom.id}`, JSON.stringify(parsedRoom))
                    await this.client.set(`user:${userid}`, JSON.stringify({ roomid: parsedRoom.id, username, active: true, balance: max_balance, items: [] }));
                    await this.client.lPush(`rooms:${auctionName}`, parsedRoom.id);
                    return Promise.resolve(parsedRoom.id);
                }
            }

            //if the queue is empty create a new room
            else {

                const room = new Room(auctionName, auctionIndex);
                room.users.push({ userid, username, active: true });
                //setting key to room via its id && also pushing roomid to queue
                await this.client.set(`room:${room.id}`, JSON.stringify(room));
                await this.client.lPush(`rooms:${auctionName}`, room.id);
                //giving user a reference to the roomid
                await this.client.set(`user:${userid}`, JSON.stringify({ roomid: room.id, username, active: true, balance: max_balance, items: [] }));

                return Promise.resolve(room.id);
            }

        } catch (error) {
            console.error("Error finding room: ", error)
            return Promise.reject(error);
        }
    }




    async toggleUsersActiveStatus(roomid : string) : Promise<Array<RoomUser>> {
        try {
            const room : string | null = await this.client.get(`room:${roomid}`);
            if(room === null)
                throw new Error(`User ${roomid} not found`);
            const parsedRoom = JSON.parse(room) as Room;

            for(const u of parsedRoom.users){
                const user = await this.client.get(`user:${u.userid}`);
                if(user === null){
                    await this.kickUser(u.userid, roomid)
                    throw new Error(`User ${u.userid} not found`);
                }
                const parsedUser = JSON.parse(user) as RoomUser;
                if (parsedUser.active) {
                    u.active = true;
                }
            }
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            const users = parsedRoom.users as Array<RoomUser>;
            return Promise.resolve(users);
        } catch (error) {
            if(error instanceof Error){
                return Promise.reject(`Error in setting active status of users in the room: ${error.message}`);
            }
            return Promise.reject("Error in setting active status of users in the room");
        }
    }

    async toggleSingleUserActiveStatus(userid : string) : Promise<void>{
        try {
            const user = await this.client.get(`user:${userid}`);
            if(user === null){
                throw new Error(`User ${userid} not found`);
            }
            const parsedUser = JSON.parse(user);
            parsedUser.active = !parsedUser.active;
            const room = await this.client.get(`room:${parsedUser.roomid}`);
            if(room === null)
                throw new Error(`Room ${parsedUser.roomid} not found`);
        
            if (!parsedUser.active) {
                const parsedRoom = JSON.parse(room);
                parsedRoom.users.forEach((user : RoomUser) => {
                    if (user.userid === parsedUser.userid)
                        user.active = !user.active;
                });
                await this.client.set(`room:${parsedUser.roomid}`, JSON.stringify(parsedRoom));
            }
            await this.client.set(`user:${userid}`, JSON.stringify(parsedUser));

            return Promise.resolve();
        } catch (error) {
            if(error instanceof Error){
                return Promise.reject(`Error in setting user active status: ${error.message}`);
            }
            return Promise.reject("Error in setting user active status");
        }
    }

    async setUsersToActive(roomid : string) : Promise<void>{
        try {
            const room = await this.client.get(roomid);
            if(room === null)
                throw new Error(`Room ${roomid} not found`);
            const parsedRoom = JSON.parse(room) as Room;

            for(const u of parsedRoom.users){
                const user : string | null = await this.client.get(`user:${u.userid}`);
                if(user === null){
                    throw new Error(`User ${u.userid} not found`);
                }
                const parsedUser = JSON.parse(user) as RedisUser;
                u.active = true;
                parsedUser.active = true;
                await this.client.set(`user:${u.userid}`, JSON.stringify(parsedUser));
            };
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));

            return Promise.resolve();
        } catch (error) {
            console.error("Error in setting user active status: ", error);
        }
    }

    async getUserActiveStatus(userid : string) : Promise<void>{
        try {
            const user = await this.client.get(`user:${userid}`);
            if(user === null){
                throw new Error(`User ${userid} not found`);
            }
            const parsedUser = JSON.parse(user);
            return Promise.resolve(parsedUser?.active);
        } catch (error) {
            console.error("Error getting user active status: ", error);
            throw error;
        }
    }

    async getUsers(roomid: string): Promise<RoomUser[]> {
        try {
            const room: string | null = await this.client.get(`room:${roomid}`);
    
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
    
            const parsedRoom = JSON.parse(room) as Room;
    
            return parsedRoom.users || [];
    
        } catch (error) {
            console.error("Error fetching users: ", error);
            throw error;
        }
    }

    async checkWhetherFull(roomid: string): Promise<boolean> {
        try {
            const room: string | null = await this.client.get(`room:${roomid}`);
    
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
    
            const parsedRoom = JSON.parse(room) as Room;
    
            return parsedRoom.max;
    
        } catch (error) {
            console.error("Error checking whether room is full or not: ", error);
            throw error;
        }
    }

    async getPreGameData(roomid: string): Promise<string> {
        try {
            const room: string | null = await this.client.get(`room:${roomid}`);
    
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
    
            const parsedRoom = JSON.parse(room) as Room;
    
            const data: string = await callGrok(parsedRoom.auctionIndex);
            const parsedData = JSON.parse(data) as GrokItemResponse;
    
            const { item, rarity, audio_url, img_url } = parsedData;
    
            const {
                item_name,
                item_value,
                starting_bid,
                item_guessing_range,
                item_description
            } = item;
    
            parsedRoom.itemData = {
                name: item_name,
                value: item_value,
                bid: starting_bid,
                range: item_guessing_range,
                description: item_description,
                audio_url,
                img_url,
                bidder_id: "",
                rarity
            };
    
            await this.client.set(
                `room:${roomid}`,
                JSON.stringify(parsedRoom)
            );
            const chosenAuction = auctionData.auctions.mainline_auctions[parsedRoom.auctionIndex] as Auction;
            const getMaxBalance = (): number => {
                return chosenAuction.value_range[1] as number;
            };
    
            const max_balance: number = getMaxBalance();
    
            return JSON.stringify({
                rounds: parsedRoom.rounds,
                item_data: parsedRoom.itemData,
                max_balance,
                bid_options: parsedRoom.bid_options
            });
    
        } catch (error) {
            console.error("Error getting pregame data: ", error);
            throw error;
        }
    }

    async setItem(roomid: string): Promise<Item> {
        try {
            const room: string | null = await this.client.get(`room:${roomid}`);
    
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
    
            const parsedRoom = JSON.parse(room) as Room;
    
            const data: string = await callGrok(parsedRoom.auctionIndex);
            const parsedData = JSON.parse(data) as GrokItemResponse;
    
            const { item, audio_url, rarity, img_url } = parsedData;
    
            const {
                item_name,
                item_value,
                starting_bid,
                item_guessing_range,
                item_description
            } = item;
    
            parsedRoom.itemData = {
                name: item_name,
                value: item_value,
                bid: starting_bid,
                range: item_guessing_range,
                description: item_description,
                audio_url,
                img_url,
                bidder_id: "",
                rarity
            };
    
            await this.client.set(
                `room:${roomid}`,
                JSON.stringify(parsedRoom)
            );
    
            return parsedRoom.itemData;
    
        } catch (error) {
            console.error("Error setting next item: ", roomid);
            throw error;
        }
    }


    async checkGameStarted(roomid: string): Promise<boolean> {
        try {
            const room: string | null = await this.client.get(`room:${roomid}`);
    
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
    
            const parsedRoom = JSON.parse(room) as Room;
            return parsedRoom.in_progress;
    
        } catch (error) {
            console.error("Error checking if game started: ", error);
            throw error;
        }
    }


    async startGame(roomid: string): Promise<void> {
        try {
            const room: string | null = await this.client.get(`room:${roomid}`);
    
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
    
            const parsedRoom = JSON.parse(room) as Room;
            parsedRoom.in_progress = true;
    
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));

            return;
    
        } catch (error) {
            console.error("Error starting game: ", error);
            throw error;
        }
    }

    async kickUser(userid: string, curr_roomid: string): Promise<void> {
        try {
            const userData: string | null = await this.client.get(`user:${userid}`);
    
            if (!userData) {
                console.log(`User ${userid} not found in Redis`);
                return;
            }
    
            const parsedUser = JSON.parse(userData) as RedisUser;
            const roomid: string = parsedUser.roomid;
    
            if (curr_roomid === roomid) {
                const room: string | null = await this.client.get(`room:${roomid}`);
    
                if (room === null) {
                    throw new Error(`Room ${roomid} not found`);
                }
    
                const parsedRoom = JSON.parse(room) as Room;
    
                parsedRoom.users = parsedRoom.users.filter(
                    (kickuser: RoomUser) => kickuser.userid !== userid
                );
    
                await this.client.del(`user:${userid}`);
                await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
    
                return;
            }
    
        } catch (error) {
            console.error("Error kicking user: ", error);
            throw error;
        }
    }

    async deleteRoom(roomid : string) : Promise<void>{
        try {
            await this.client.del(`room:${roomid}`);
            console.log(`Deleted keys: ${Responses}`);
        } catch (error) {
            console.error("Error deleting room: ", error)
        }
    }
}


const redisRoomHandler = new RoomHandler();
export default redisRoomHandler;


