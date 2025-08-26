const { Server } = require('socket.io');
const { socketAuth } = require('./auth');
require('dotenv').config();
const {handleGameLogic} = require("./GameLogic.js")
const redisRoomHandler = require("../RedisRooms/RoomHandler.js")
const jwt = require('jsonwebtoken');
// Optional: Redis adapter if you scale horizontally
// const { createAdapter } = require('@socket.io/redis-adapter');
// const { createClient } = require('redis');




// const generateAccessToken = (user) => {
//     return jwt.sign({ userid: user._id, username: user.username }, process.env.ACCESS_TOKEN_SECRET, {
//         expiresIn: "5m",
//     });
// };
  
const generateRoomAccessToken = (user, roomid) => {
return jwt.sign({ userid: user.userid, username: user.username, roomid }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "5m",
});
}

async function initSocket(server, corsOpts) {
    await redisRoomHandler.initClient()
    const io = new Server(server, {
        cors: corsOpts,
        connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: false,
    }});

  io.use(socketAuth);

    io.on("connection", async (socket) => {
        let userID;
        let roomID;
        const auctionIndex = socket.auctionIndex;
        console.log(auctionIndex)
        try{
            if(socket.session) {
                const {userid, roomid} = socket.session;
                userID = userid;
                roomID = roomid;
                const user = await redisRoomHandler.getUser(userid);
                socket.join(roomid)
                if(user != null){
                    await redisRoomHandler.toggleUserActiveStatus(userid)
                }
            }
            else {
                const { userid, username } = socket.user
                userID = userid;
                const roomid = await redisRoomHandler.findRoom(userid, username, auctionIndex);
                roomID = roomid;
                socket.join(roomid)
                const roomToken = generateRoomAccessToken({userid, username}, roomid)
                io.to(socket.id).emit("room token", { roomToken });
                const users = await redisRoomHandler.getUsers(roomid)
                console.log("users: " + users)
                io.to(roomid).emit('user list', { userlist: users })
                if(await redisRoomHandler.checkWhetherFull(roomid)){
                    console.log("Begin Game!")
                    handleGameLogic(io, roomid)
                }
            }
        }catch(error){
            console.error("Join failed:", error.message);
            socket.emit("error message", "Room not found or full");
        }
        socket.on("disconnect", async() => {
            try{

           
            console.log("left")
            if(await redisRoomHandler.checkGameStarted(roomID))
                await redisRoomHandler.toggleUserActiveStatus(userID)
            else{
                await redisRoomHandler.kickUser(userID, roomID)
            }
            const users = await redisRoomHandler.getUsers(roomID)
            if(users.length == 0)
                await redisRoomHandler.deleteRoom(roomID);
            else
                await io.to(roomID).emit('user list', { userlist: users })
            }catch(error){}
        }); 
    });
    return io;
}





module.exports = { initSocket };