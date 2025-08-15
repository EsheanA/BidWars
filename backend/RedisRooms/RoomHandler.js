const { createClient } = require("redis")
const { generateItem } = require("../itemGeneration/generateItems.js")
const Room = require("./Room.js")
require('dotenv').config();


class RoomHandler {
    constructor() {
        if (!RoomHandler.instance) {
            this.client = createClient({
                url: process.env.REDIS_URL,
                socket: {
                    tls: true,
                    rejectUnauthorized: false,
                }
            });

            this.client.on('connect', () => {
                console.log('RedisRoomHandler connected to Redis');
            });

            this.client.on('error', (err) => {
                console.error('Redis error', err);
            });

            RoomHandler.instance = this;
        }

        return RoomHandler.instance;
    }



    async getUser(userid) {
        try {
            const user = await this.client.get(`user:${userid}`);
            const parsedUser = JSON.parse(user);
            return Promise.resolve(parsedUser);
        } catch (error) {
            console.error("Error getting user info: ", error);
            return Promise.reject(null);
        }
    }

    async initClient() {
        try {
            await this.client.connect();
            return Promise.resolve();
        } catch (error) {
            console.error(error);
            return Promise.reject(error);
        }
    }

    async awardItem(roomid){
        try{
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            const userid = parsedRoom.itemData.bidder_id;
            if(userid){
                const user = await this.client.get(`user:${userid}`)
                const parsedUser = JSON.parse(user)
                const currentItem = parsedRoom.itemData
                parsedRoom.items.push(currentItem);
                parsedRoom.itemData.bidder_id = null;
                parsedUser.balance = parsedUser.balance - currentItem.bid;
                await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
                await this.client.set(`user:${userid}`, JSON.stringify(parsedUser));
                return Promise.resolve({newBalance: parsedUser.balance, userid: user.userid});
            }

        }catch(error){
            console.error("Error awarding item ", error)
            return Promise.reject("Error awarding item: ", error);
        }
    }

    async handleBid(roomid, userid, bid){
        try{
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            const user = await this.client.get(`user:${userid}`)
            const parsedUser = JSON.parse(user)
            if(parsedUser.balance >= bid){
                parsedRoom.itemData.bid = bid;
                parsedRoom.itemData.bidder_id = userid;
                await redis.client.set(`room:${roomid}`, JSON.stringify(parsedRoom))
                return Promise.resolve({userid, bid})
            }
            else{   
                return Promise.resolve({userid: null, bid})
            }

            
            

        }catch(error){
            console.error("Error handling user bid: ", error)
            return Promise.reject("Error handling user bid: ", error);
        }
    }

    async findRoom(userid, username, auctionName) {
        try {
            const validRoomID = await this.client.lPop(`rooms:${auctionName}`);
            if (validRoomID) {
                const room = await this.client.get(`room:${validRoomID}`);
                const parsedRoom = JSON.parse(room)
                //first check if room is full or in progress
                if (parsedRoom.max || parsedRoom.in_progress) {
                    await this.client.lPush(`rooms:${auctionName}`, JSON.stringify(parsedRoom));
                    const room = new Room(auctionName);
                    room.users.push({ userid, username, active: true });
                    //setting key to room via its id && also pushing roomid to queue
                    await this.client.set(`room:${room.id}`, JSON.stringify(room));
                    await this.client.lPush(`rooms:${auctionName}`, room.id);
                    //giving user a reference to the roomid
                    await this.client.set(`user:${userid}`, JSON.stringify({ roomid: room.id, username, active: true, balance: 250}));
    
                    return Promise.resolve(room.id);

                } 
                //otherwise just add user to the room at the top of queue
                else {
                    parsedRoom.users.push({ userid, username, active: true });
                    if (parsedRoom.limit == parsedRoom.users.length)
                        parsedRoom.max = true;
                    await this.client.set(`room:${parsedRoom.id}`, JSON.stringify(parsedRoom))
                    await this.client.set(`user:${userid}`, JSON.stringify({ roomid: parsedRoom.id, username, active: true, balance: 250}));
                    await this.client.lPush(`rooms:${auctionName}`, parsedRoom.id);
                    return Promise.resolve(parsedRoom.id);
                }
            } 
            //if the queue is empty create a new room
            else {
                
                const room = new Room();
                room.users.push({ userid, username, active: true });
                console.log(room.users)
                //setting key to room via its id && also pushing roomid to queue
                await this.client.set(`room:${room.id}`, JSON.stringify(room));
                await this.client.lPush(`rooms:${auctionName}`, room.id);
                //giving user a reference to the roomid
                await this.client.set(`user:${userid}`, JSON.stringify({ roomid: room.id, username, active: true, balance: 250 }));

                return Promise.resolve(room.id);
            }

        } catch (error) {
            console.error("Error finding room: ", error)
            return Promise.reject(error);
        }
    }


    async kickUser(userid) {
        try {
            const roomid = await this.client.get(`user:${userid}`);
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);

            parsedRoom.users = parsedRoom.users.filter(kickuser => kickuser.userid != userid);

            await this.client.del(`user:${userid}`);
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));

            return Promise.resolve();
        } catch (error) {
            console.error("Error kicking user: ", error);
            return Promise.reject(error);
        }
    }

    async toggleUserActiveStatus(userid) {
        try {
            const user = await this.client.get(`user:${userid}`);
            const parsedUser = JSON.parse(user);
            parsedUser.active = !parsedUser.active;
            const room = await this.client.get(parsedUser.roomid);

            if (!parsedUser.active) {
                const parsedRoom = JSON.parse(room);
                parsedRoom.users.forEach((u, index, arr) => {
                    if (u.userid == parsedUser.userid)
                        arr[index].active = !arr[index].active;
                });
                await this.client.set(`room:${parsedUser.roomid}`, JSON.stringify(parsedRoom));
            }
            await this.client.set(`user:${userid}`, JSON.stringify(parsedUser));

            return Promise.resolve();
        } catch (error) {
            console.error("Error in setting user active status: ", error);
            return Promise.reject(error);
        }
    }

    async setUsersToActive(roomid) {
        try {
            const room = await this.client.get(roomid);
            const parsedRoom = JSON.parse(room);

            parsedRoom.users.forEach(async (u, index, arr) => {
                const user = await this.client.get(`user:${u.userid}`)
                const parsedUser = JSON.parse(user)
                if (parsedUser?.active)
                    arr[index].active = true;
                await this.client.set(`user:${u.userid}`, { userid, roomid: parsedRoom.id, active: true });
            });
            await this.client.set(`room:${parsedUser.roomid}`, JSON.stringify(parsedRoom));

            return Promise.resolve();
        } catch (error) {
            console.error("Error in setting user active status: ", error);
            return Promise.reject(error);
        }
    }

    async getUserActiveStatus(userid) {
        try {
            const status = await this.client.get(`user:${userid}`);
            const parsedStatus = JSON.parse(status);
            return Promise.resolve(parsedStatus?.active);
        } catch (error) {
            console.error("Error getting user active status: ", error);
            return Promise.reject(error);
        }
    }

    async getUsers(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`)
            const parsedRoom = JSON.parse(room)
            return Promise.resolve(parsedRoom?.users || []);
        } catch (error) {
            console.error("Error fetching users: ", error);
            return Promise.resolve([]);
        }
    }

    async checkWhetherFull(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            return Promise.resolve(parsedRoom.max);
        } catch (error) {
            console.error("Error checking whether room is full or not: ", error);
            return Promise.reject(error);
        }
    }
    async getPreGameData(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);

            const firstItem = generateItem(parsedRoom.auction)
            const { name, value, url, starting_bid } = firstItem;
            room.itemData.item = { name, value, url }
            room.itemData.bid = starting_bid;
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            return ({ rounds: parsedRoom.rounds, item: firstItem, maxBalance: 250});

        } catch (error) {
            console.error("Error getting pregame data: ", error)
        }
    }

    async checkGameStarted(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            return Promise.resolve(parsedRoom.in_progress);
        } catch (error) {
            console.error("Error checking if game started: ", error);
            return Promise.reject(error);
        }
    }
    async startGame(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            parsedRoom.in_progress = true;
            return Promise.resolve()
        } catch (error) {
            console.error("Error starting game: ", error)
            return Promise.reject(error)
        }
    }
}
const redisRoomHandler = new RoomHandler();
// Exporting the singleton instance
module.exports = redisRoomHandler;


