const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const RoomGroup = require('./RoomRelated/RoomGroup');
const cors = require('cors')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const { v4: uuidv4 } = require("uuid");

app.use(cors())
app.use(express.json())

const rooms = new RoomGroup();
const userdb = [];
const refreshtokens = [];

const generateAccessToken = (user) => {
  return jwt.sign({ userid: user.userid, username: user.username}, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "5m",
  });
};

const generateRoomAccessToken = (user, roomid) =>{
  return jwt.sign({ userid: user.userid, username: user.username, roomid}, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "5m",
  });
}
const generateRefreshToken = (user) => {
  return jwt.sign({ id: user.id}, process.env.REFRESH_TOKEN_SECRET);
};




app.get('/', (req, res) => {
    res.status(200).send('Server is up');
});

app.post('/createAccount', (req, res) =>{
  const {username} = req.body;
  let newUser = {
    userid: `${uuidv4()}`,
    username
  }
  const accessToken = generateAccessToken(newUser)
  // const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET)
  // refreshtokens.push(refreshToken);
  userdb.push(newUser);
  res.json({userid: newUser.userid, username: newUser.username, accessToken})
});


const io = new Server(server, {
    cors: {
      origin: "*", 
      methods: ['GET', 'POST'],
      credentials: true
    }
    // connectionStateRecovery: {
    //   maxDisconnectionDuration: 2 * 60 * 1000,
    //   skipMiddlewares: true,
    // }
});


io.use((socket, next) => {
  const {roomToken} = socket.handshake.auth;
  if(roomToken){
    next()
  }else{
    try{
      const {accessToken} = socket.handshake.auth;
      const user = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
      socket.user = user;
      next()
    }catch(error){
      // console.log("error")
      next(new Error("Authentication error"))
    }
  }
});


io.on("connection", async (socket) => {
    let userID;
    let roomID;
    let currRoom;
    const {roomToken} = socket.handshake.auth
    
    if(roomToken){
      const {username, userid, roomid} = jwt.verify(roomToken, process.env.ACCESS_TOKEN_SECRET)
      if(roomid){
        const user = {
          userid,
          username
        }
        userID = user.userid
        roomID = roomid
        const {id, room} = await rooms.joinPublicCode(user, roomid);
        socket.join(id);
        currRoom = room;
        io.to(socket.id).emit('user data', {id: user.userid, username: user.username})
        setTimeout(() => {
          console.log(room.users)
          io.to(id).emit('user list', {userlist: room.users})
        }, "1000");
        
      }
    }
    else{
      const {userid, username} = socket.user
      const {id, room} = await rooms.joinRoom();
      const user = {
          userid,
          username
      }
      userID = user.userid
      roomID = id
      currRoom = room;
      socket.join(id);
      room.join(user)
      const roomToken = generateRoomAccessToken(user, id)
      io.to(socket.id).emit("room token", {roomToken});
      io.to(id).emit('user list', {userlist: room.users})
    }
    socket.on("disconnect", () => {
      rooms.leaveRoom(userID, roomID);
      console.log(currRoom.users)
      io.to(roomID).emit('user list', {userlist: currRoom.users})
    });
    
});

server.listen(3000, () => {
    console.log('listening on *:3000');
  });