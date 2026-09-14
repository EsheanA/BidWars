"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("redis");
const Room_1 = __importDefault(require("./Room"));
const grok_1 = __importDefault(require("../itemGeneration/grok"));
const auctionz_json_1 = __importDefault(require("../auctions/auctionz.json"));
const Item_1 = __importDefault(require("../models/Item"));
const User_1 = __importDefault(require("../models/User"));
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
const resources_1 = require("openai/resources");
dotenv_1.default.config();
class RoomHandler {
    static instance;
    client;
    constructor() {
        if (!RoomHandler.instance) {
            const redisUrl = process.env.REDIS_URL;
            if (!redisUrl) {
                throw new Error("REDIS_URL is undefined");
            }
            this.client = (0, redis_1.createClient)({
                url: redisUrl,
            });
            this.client.on("connect", async () => {
                console.log("RedisRoomHandler connected to Redis");
                await this.client.flushDb();
                console.log("Redis database cleared successfully.");
            });
            this.client.on("error", (err) => {
                console.error("Redis error", err);
            });
            RoomHandler.instance = this;
        }
        return RoomHandler.instance;
    }
    async getUser(userid) {
        try {
            const user = await this.client.get(`user:${userid}`);
            if (user === null) {
                throw new Error(`User ${userid} not found`);
            }
            const parsedUser = JSON.parse(user);
            return Promise.resolve(parsedUser);
        }
        catch (error) {
            console.error("Error getting user info: ", error);
            throw error;
        }
    }
    //checks if a user exists in a room
    async userExist(userid) {
        try {
            const user = await this.client.get(`user:${userid}`);
            if (user === null) {
                return false;
            }
            else {
                return true;
            }
        }
        catch (error) {
            console.error("Error getting user info: ", error);
            return false;
        }
    }
    async initClient() {
        try {
            await this.client.connect();
            return Promise.resolve();
        }
        catch (error) {
            console.error(error);
            return Promise.reject(error);
        }
    }
    async distributeItemDB(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
            const parsedRoom = JSON.parse(room);
            const itemData = parsedRoom.itemData;
            if (itemData === null)
                throw new Error(`Item data of room ${roomid} not found`);
            const { name, value, description, img_url, audio_url, bidder_id, bid } = itemData;
            if (bidder_id === null)
                return;
            if (bid === null)
                throw new Error("Bid is missing");
            const hashcode = crypto_1.default
                .createHash("sha256")
                .update(name + bidder_id)
                .digest("hex");
            const existingItem = await Item_1.default.findOne({
                hashcode: hashcode
            });
            if (existingItem) {
                await Item_1.default.findOneAndUpdate({ hashcode: hashcode }, { $inc: { amount: 1 } });
            }
            else {
                const newItem = new Item_1.default({
                    hashcode: hashcode,
                    name,
                    value,
                    img_url,
                    audio_url,
                    description,
                    bid,
                    amount: 1,
                    owner: bidder_id
                });
                await newItem.save();
            }
            await User_1.default.findByIdAndUpdate(bidder_id, { $inc: { balance: -1 * bid } });
        }
        catch (error) {
            console.error("Error distributing item: ", error);
            return;
        }
    }
    async logItem(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
            const parsedRoom = JSON.parse(room);
            const itemData = parsedRoom.itemData;
            if (itemData === null)
                throw new Error(`Item data of room ${roomid} not found`);
            const userid = itemData.bidder_id;
            if (userid !== null) {
                const user = await this.client.get(`user:${userid}`);
                if (user === null) {
                    throw new Error(`User ${userid} not found`);
                }
                const parsedUser = JSON.parse(user);
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
            }
            else {
                return Promise.resolve({
                    balance: null,
                    userid: null
                });
            }
        }
        catch (error) {
            console.error("Error awarding item ", error);
            return Promise.reject(error);
        }
    }
    async handleBid(userid, bid) {
        try {
            const user = await this.client.get(`user:${userid}`);
            if (user === null)
                throw new Error(`User ${userid} not found`);
            const parsedUser = JSON.parse(user);
            const { roomid, active, balance } = parsedUser;
            const room = await this.client.get(`room:${roomid}`);
            if (room === null)
                throw new Error(`User ${roomid} not found`);
            const parsedRoom = JSON.parse(room);
            if (parsedRoom.itemData === null) {
                throw new Error(`Current item data could not be found`);
            }
            if (balance >= bid && active) {
                parsedRoom.itemData.bid = bid;
                console.log("latest bid: ", parsedRoom.itemData.bid);
                parsedRoom.itemData.bidder_id = userid;
                await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
                return Promise.resolve(({ userid, bid, roomid }));
            }
            else {
                return Promise.resolve({ userid: "", bid, roomid: "" });
            }
        }
        catch (error) {
            if (error instanceof Error) {
                console.error(`Error handling user bid: ${error.message}`);
                return Promise.reject(`Error handling user bid: ${error.message}`);
            }
            else {
                return Promise.reject("Error handling user bid");
            }
        }
    }
    async findRoom(userid, username, auctionIndex) {
        try {
            const mainline_auctions = auctionz_json_1.default.auctions.mainline_auctions;
            const auctionName = mainline_auctions[auctionIndex]?.name;
            const getMaxBalance = () => {
                return mainline_auctions[auctionIndex]?.value_range[1];
            };
            const max_balance = getMaxBalance();
            const validRoomID = await this.client.lPop(`rooms:${auctionName}`);
            const room = await this.client.get(`room:${validRoomID}`);
            if (room) {
                const parsedRoom = JSON.parse(room);
                //first check if room is full or in progress
                if (parsedRoom.max || parsedRoom.in_progress) {
                    await this.client.lPush(`rooms:${auctionName}`, JSON.stringify(parsedRoom));
                    const room = new Room_1.default(auctionName, auctionIndex);
                    room.users.push({ userid, username, active: true });
                    //setting key to room via its id && also pushing roomid to queue
                    await this.client.set(`room:${room.id}`, JSON.stringify(room));
                    await this.client.lPush(`rooms:${auctionName}`, room.id);
                    //giving user a reference to the roomid
                    const user = {
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
                    const roomUser = { userid, username, active: true };
                    parsedRoom.users.push(roomUser);
                    if (parsedRoom.limit === parsedRoom.users.length)
                        parsedRoom.max = true;
                    await this.client.set(`room:${parsedRoom.id}`, JSON.stringify(parsedRoom));
                    await this.client.set(`user:${userid}`, JSON.stringify({ roomid: parsedRoom.id, username, active: true, balance: max_balance, items: [] }));
                    await this.client.lPush(`rooms:${auctionName}`, parsedRoom.id);
                    return Promise.resolve(parsedRoom.id);
                }
            }
            //if the queue is empty create a new room
            else {
                const room = new Room_1.default(auctionName, auctionIndex);
                room.users.push({ userid, username, active: true });
                //setting key to room via its id && also pushing roomid to queue
                await this.client.set(`room:${room.id}`, JSON.stringify(room));
                await this.client.lPush(`rooms:${auctionName}`, room.id);
                //giving user a reference to the roomid
                await this.client.set(`user:${userid}`, JSON.stringify({ roomid: room.id, username, active: true, balance: max_balance, items: [] }));
                return Promise.resolve(room.id);
            }
        }
        catch (error) {
            console.error("Error finding room: ", error);
            return Promise.reject(error);
        }
    }
    async toggleUsersActiveStatus(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            if (room === null)
                throw new Error(`User ${roomid} not found`);
            const parsedRoom = JSON.parse(room);
            for (const u of parsedRoom.users) {
                const user = await this.client.get(`user:${u.userid}`);
                if (user === null) {
                    await this.kickUser(u.userid, roomid);
                    throw new Error(`User ${u.userid} not found`);
                }
                const parsedUser = JSON.parse(user);
                if (parsedUser.active) {
                    u.active = true;
                }
            }
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            const users = parsedRoom.users;
            return Promise.resolve(users);
        }
        catch (error) {
            if (error instanceof Error) {
                return Promise.reject(`Error in setting active status of users in the room: ${error.message}`);
            }
            return Promise.reject("Error in setting active status of users in the room");
        }
    }
    async toggleSingleUserActiveStatus(userid) {
        try {
            const user = await this.client.get(`user:${userid}`);
            if (user === null) {
                throw new Error(`User ${userid} not found`);
            }
            const parsedUser = JSON.parse(user);
            parsedUser.active = !parsedUser.active;
            const room = await this.client.get(`room:${parsedUser.roomid}`);
            if (room === null)
                throw new Error(`Room ${parsedUser.roomid} not found`);
            if (!parsedUser.active) {
                const parsedRoom = JSON.parse(room);
                parsedRoom.users.forEach((user) => {
                    if (user.userid === parsedUser.userid)
                        user.active = !user.active;
                });
                await this.client.set(`room:${parsedUser.roomid}`, JSON.stringify(parsedRoom));
            }
            await this.client.set(`user:${userid}`, JSON.stringify(parsedUser));
            return Promise.resolve();
        }
        catch (error) {
            if (error instanceof Error) {
                return Promise.reject(`Error in setting user active status: ${error.message}`);
            }
            return Promise.reject("Error in setting user active status");
        }
    }
    async setUsersToActive(roomid) {
        try {
            const room = await this.client.get(roomid);
            if (room === null)
                throw new Error(`Room ${roomid} not found`);
            const parsedRoom = JSON.parse(room);
            for (const u of parsedRoom.users) {
                const user = await this.client.get(`user:${u.userid}`);
                if (user === null) {
                    throw new Error(`User ${u.userid} not found`);
                }
                const parsedUser = JSON.parse(user);
                u.active = true;
                parsedUser.active = true;
                await this.client.set(`user:${u.userid}`, JSON.stringify(parsedUser));
            }
            ;
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            return Promise.resolve();
        }
        catch (error) {
            console.error("Error in setting user active status: ", error);
        }
    }
    async getUserActiveStatus(userid) {
        try {
            const user = await this.client.get(`user:${userid}`);
            if (user === null) {
                throw new Error(`User ${userid} not found`);
            }
            const parsedUser = JSON.parse(user);
            return Promise.resolve(parsedUser?.active);
        }
        catch (error) {
            console.error("Error getting user active status: ", error);
            throw error;
        }
    }
    async getUsers(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
            const parsedRoom = JSON.parse(room);
            return parsedRoom.users || [];
        }
        catch (error) {
            console.error("Error fetching users: ", error);
            throw error;
        }
    }
    async checkWhetherFull(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
            const parsedRoom = JSON.parse(room);
            return parsedRoom.max;
        }
        catch (error) {
            console.error("Error checking whether room is full or not: ", error);
            throw error;
        }
    }
    async getPreGameData(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
            const parsedRoom = JSON.parse(room);
            const data = await (0, grok_1.default)(parsedRoom.auctionIndex);
            const parsedData = JSON.parse(data);
            const { item, rarity, audio_url, img_url } = parsedData;
            const { item_name, item_value, starting_bid, item_guessing_range, item_description } = item;
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
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            const chosenAuction = auctionz_json_1.default.auctions.mainline_auctions[parsedRoom.auctionIndex];
            const getMaxBalance = () => {
                return chosenAuction.value_range[1];
            };
            const max_balance = getMaxBalance();
            return JSON.stringify({
                rounds: parsedRoom.rounds,
                item_data: parsedRoom.itemData,
                max_balance,
                bid_options: parsedRoom.bid_options
            });
        }
        catch (error) {
            console.error("Error getting pregame data: ", error);
            throw error;
        }
    }
    async setItem(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
            const parsedRoom = JSON.parse(room);
            const data = await (0, grok_1.default)(parsedRoom.auctionIndex);
            const parsedData = JSON.parse(data);
            const { item, audio_url, rarity, img_url } = parsedData;
            const { item_name, item_value, starting_bid, item_guessing_range, item_description } = item;
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
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            return parsedRoom.itemData;
        }
        catch (error) {
            console.error("Error setting next item: ", roomid);
            throw error;
        }
    }
    async checkGameStarted(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
            const parsedRoom = JSON.parse(room);
            return parsedRoom.in_progress;
        }
        catch (error) {
            console.error("Error checking if game started: ", error);
            throw error;
        }
    }
    async startGame(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            if (room === null) {
                throw new Error(`Room ${roomid} not found`);
            }
            const parsedRoom = JSON.parse(room);
            parsedRoom.in_progress = true;
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            return;
        }
        catch (error) {
            console.error("Error starting game: ", error);
            throw error;
        }
    }
    async kickUser(userid, curr_roomid) {
        try {
            const userData = await this.client.get(`user:${userid}`);
            if (!userData) {
                console.log(`User ${userid} not found in Redis`);
                return;
            }
            const parsedUser = JSON.parse(userData);
            const roomid = parsedUser.roomid;
            if (curr_roomid === roomid) {
                const room = await this.client.get(`room:${roomid}`);
                if (room === null) {
                    throw new Error(`Room ${roomid} not found`);
                }
                const parsedRoom = JSON.parse(room);
                parsedRoom.users = parsedRoom.users.filter((kickuser) => kickuser.userid !== userid);
                await this.client.del(`user:${userid}`);
                await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
                return;
            }
        }
        catch (error) {
            console.error("Error kicking user: ", error);
            throw error;
        }
    }
    async deleteRoom(roomid) {
        try {
            await this.client.del(`room:${roomid}`);
            console.log(`Deleted keys: ${resources_1.Responses}`);
        }
        catch (error) {
            console.error("Error deleting room: ", error);
        }
    }
}
const redisRoomHandler = new RoomHandler();
exports.default = redisRoomHandler;
//# sourceMappingURL=RoomHandler.js.map