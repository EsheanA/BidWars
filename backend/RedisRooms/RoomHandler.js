const { createClient } = require("redis")
const Room = require("./Room.js");
const { callGrok } = require("../itemGeneration/grok.js");
const auctionData = require('../auctions/auctionz.json')
const Item = require('../models/Item');
const User = require('../models/User')
const crypto = require('crypto');

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

            this.client.on('connect', async() => {
                console.log('RedisRoomHandler connected to Redis');
                await this.client.flushDb(); 
                console.log('Redis database cleared successfully.');
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

    //checks if a user exists in a room
    async userExist(userid){
        try{
            const user = await this.client.get(`user:${userid}`)
            if(user == null){
                return false
            }
            else{
                return true;
            }
        }catch(error){
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


    async distributeItemDB(roomid){
        try{
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            const {itemData} = parsedRoom;
            const {
                name, 
                value, 
                description, 
                img_url, 
                audio_url, 
                bidder_id, 
                bid,
                category, 
                rarity
            } = itemData;
            if(bidder_id == null)
                return;
            const hashcode = crypto.createHash('sha256').update(name + bidder_id).digest('hex'); //item hash composed of item name & userid
            const existingItem = await Item.findOne(
                {hashcode: hashcode}
            );

            if(existingItem){
                await Item.findOneAndUpdate(
                        { hashcode: hashcode},
                        { $inc: { amount: 1 } }
                    );
                }
            else{
                const newItem = new Item({
                    hashcode: hashcode,
                    name,
                    value,
                    img_url,
                    audio_url,
                    description,
                    category,
                    rarity,
                    bid,
                    amount: 1,
                    owner: bidder_id
                })
                await newItem.save()
            }
            await User.findByIdAndUpdate(
                bidder_id, 
                { $inc:{ balance: -1*bid}}
            );
            
        }catch(error){
            console.error("Error distributing item: ", error)
        }
    }

    async logItem(roomid){
        try{
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            const userid = parsedRoom.itemData.bidder_id;
            if(userid != null){
                const user = await this.client.get(`user:${userid}`)
                const parsedUser = JSON.parse(user)

                const currentItem = parsedRoom.itemData
                parsedUser.balance = parsedUser.balance - currentItem.bid;
                // parsedRoom.items.push(currentItem);
                parsedRoom.itemData.bidder_id = null;
                parsedRoom.itemData.bid = null;
                

                await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
                await this.client.set(`user:${userid}`, JSON.stringify(parsedUser));
                console.log("balance: ", parsedUser.balance)
                console.log("userid: ", userid)
                return Promise.resolve({balance: parsedUser.balance, userid});
            }
            else{
                return Promise.resolve({balance: null, userid: null});
            }

        }catch(error){
            console.error("Error awarding item ", error)
            return Promise.reject("Error awarding item: ", error);
        }
    }

    async handleBid(userid, bid){
        try{
            const user = await this.client.get(`user:${userid}`)
            const parsedUser = JSON.parse(user)
            const {roomid, active, balance} = parsedUser
            const room = await this.client.get(`room:${roomid}`);

            const parsedRoom = JSON.parse(room);

            if(balance >= bid && active){
                parsedRoom.itemData.bid = bid;
                console.log("latest bid: ", parsedRoom.itemData.bid)
                parsedRoom.itemData.bidder_id = userid;
                await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom))
                return Promise.resolve(JSON.stringify({userid, bid, roomid}))
            }
            else{   
                return Promise.resolve({userid: null, bid})
            }

        }catch(error){
            console.error("Error handling user bid: ", error)
            return Promise.reject("Error handling user bid: ", error);
        }
    }

    async findRoom(userid, username, auctionIndex) {
        try {
            const auctionName = auctionData.auctions.mainline_auctions[auctionIndex].name;
            const getMaxBalance = () => {
                return(auctionData.auctions.mainline_auctions[auctionIndex].value_range[1])
            }
            const max_balance = getMaxBalance()
            const validRoomID = await this.client.lPop(`rooms:${auctionName}`);
            if (validRoomID) {
                const room = await this.client.get(`room:${validRoomID}`);
                const parsedRoom = JSON.parse(room)
                //first check if room is full or in progress
                if (parsedRoom.max || parsedRoom.in_progress) {
                    await this.client.lPush(`rooms:${auctionName}`, JSON.stringify(parsedRoom));
                    const room = new Room(auctionName, auctionIndex);
                    room.users.push({ userid, username, active: true });
                    //setting key to room via its id && also pushing roomid to queue
                    await this.client.set(`room:${room.id}`, JSON.stringify(room));
                    await this.client.lPush(`rooms:${auctionName}`, room.id);
                    //giving user a reference to the roomid
                    await this.client.set(`user:${userid}`, JSON.stringify({ 
                        roomid: room.id, 
                        username, 
                        active: true,
                        balance: max_balance, 
                        items: []
                    }));
                    return Promise.resolve(room.id);
                } 
                //otherwise just add user to the room at the top of queue
                else {
                    parsedRoom.users.push({ userid, username, active: true });
                    if (parsedRoom.limit == parsedRoom.users.length)
                        parsedRoom.max = true;
                    await this.client.set(`room:${parsedRoom.id}`, JSON.stringify(parsedRoom))
                    await this.client.set(`user:${userid}`, JSON.stringify({ roomid: parsedRoom.id, username, active: true, balance: max_balance, items: []}));
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
                await this.client.set(`user:${userid}`, JSON.stringify({ roomid: room.id, username, active: true, balance: max_balance, items: []}));

                return Promise.resolve(room.id);
            }

        } catch (error) {
            console.error("Error finding room: ", error)
            return Promise.reject(error);
        }
    }


    async kickUser(userid) {
        try {
            const userData = await this.client.get(`user:${userid}`);
            const roomid = JSON.parse(userData).roomid;
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            parsedRoom.users = parsedRoom.users.filter(kickuser => kickuser.userid != userid);
            await this.client.del([`user:${userid}`]);
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            return Promise.resolve();

        } catch (error) {
            console.error("Error kicking user: ", error);
            return Promise.reject(error);
        }
    }

    async toggleUsersActiveStatus(roomid){
        try {
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            parsedRoom.users.forEach(async(u, index, arr) => {
              const user = await this.client.get(`user:${u.userid}`);
              const parsedUser = JSON.parse(user);
              if(parsedUser.active){
                arr[index].active = true;
              }
            })
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            return Promise.resolve({users: JSON.stringify(parsedRoom.users)});
        } catch (error) {
            console.error("Error in setting active status of users in the room: ", error);
            return Promise.reject(error);
        }
    }

    async toggleUserActiveStatus(userid) {
        try {
            const user = await this.client.get(`user:${userid}`);
            const parsedUser = JSON.parse(user);
            parsedUser.active = !parsedUser.active;
            const room = await this.client.get(`room:${parsedUser.roomid}`);

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

            const data = await callGrok(parsedRoom.auctionIndex)
            const parsedData = JSON.parse(data)
            const {item, category, rarity, audio_url, img_url} = parsedData

            const { item_name, item_value, starting_bid, item_guessing_range, item_description } = item;
            parsedRoom.itemData = {
                name: item_name, 
                value: item_value, 
                bid: starting_bid, 
                range: item_guessing_range, 
                description: item_description, 
                audio_url, 
                img_url, 
                bidder_id: null,
                category: category,
                rarity: rarity
            }

            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            const getMaxBalance = () => {
                return(auctionData.auctions.mainline_auctions[parsedRoom.auctionIndex].value_range[1])
            }

            const max_balance = getMaxBalance();
            return Promise.resolve(JSON.stringify({ 
                rounds: parsedRoom.rounds, 
                item_data: parsedRoom.itemData, 
                max_balance, 
                bid_options: parsedRoom.bid_options
            }));

            // return Promise.resolve()

        } catch (error) {
            console.error("Error getting pregame data: ", error)
        }
    }

    async setItem(roomid){
        try{
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            const data = await callGrok(parsedRoom.auctionIndex);
            const parsedData = JSON.parse(data);

            const {item, category, audio_url, rarity, img_url} = parsedData;
            const { item_name, item_value, starting_bid, item_guessing_range, item_description } = item;

            parsedRoom.itemData = {
                name: item_name, 
                value: item_value, 
                bid: starting_bid, 
                range: item_guessing_range, 
                description: item_description, 
                audio_url, 
                img_url, 
                bidder_id: null,
                category: category,
                rarity: rarity
            }
            await this.client.set(`room:${roomid}`, JSON.stringify(parsedRoom));
            return Promise.resolve(JSON.stringify({item_data: parsedRoom.itemData}))

        }catch(error){
            console.error("Error setting next item: ", roomid);
            throw error;
        }
    }
    

    async checkGameStarted(roomid) {
        try {
            const room = await this.client.get(`room:${roomid}`);
            const parsedRoom = JSON.parse(room);
            return parsedRoom.in_progress;

        } catch (error) {
            console.error("Error checking if game started: ", error);
            throw error;
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


