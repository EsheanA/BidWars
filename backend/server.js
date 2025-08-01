const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const RoomGroup = require('./RoomRelated/RoomGroup');
const userRouter = require('./routes/userRoutes.js');
const cors = require('cors')
const jwt = require('jsonwebtoken')
// const redis = require('redis');
const cookie = require("cookie");
require('dotenv').config()
const mongoose = require('mongoose');
const { generateAccessToken, generateRoomAccessToken } = require('./tokenHandling/generateToken');
const { v4: uuidv4 } = require("uuid");
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path')
const Item = require('./models/Item');
const User = require('./models/User');
// import { Redis } from '@upstash/redis'
const { createClient } = require('redis');

// app.use(express.static(path.join(__dirname, 'public')));

// app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/items', express.static(path.join(__dirname, 'items')));

// function validateOrigin(origin) {
//   const originSlice = origin.slice(0, 17)
//   if (originSlice === "http://localhost:") {
//     return true;
//   }
//   return false;
// }

// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin || validateOrigin(origin)) {
//       return callback(null, true);
//     }
//     else
//       return callback(new Error('Not allowed by CORS'));
//   },
//   credentials: true
// }));


app.use(express.json())
app.use(cookieParser());
app.use('/users', userRouter);

// app.use(cors({ origin: 'https://bid-wars-ten.vercel.app', credentials: true }));
// app.options('*', cors({
//   origin: 'https://bid-wars-ten.vercel.app',
//   credentials: true
// }));

const corsOpts = {
  origin: 'https://bid-wars-ten.vercel.app',
  credentials: true,
};
app.use(cors(corsOpts));         
app.options('/*', cors(corsOpts));  

const rooms = new RoomGroup();
// const redisclient = redis.createClient();
const redisclient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    tls: true,
    rejectUnauthorized: false,
  }
});

redisclient.on('error', err => console.log('Redis Client Error', err));





app.post('/', (req, res) => {
  try {
    const {userid} = req.body
    const token = req.cookies[`token_${userid}`]
    console.log(token)
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log(decoded)
    if(decoded){
      res.status(200).send('Server is up');
    }
    else{
      res.status(401).json({ error: 'Invalid token' });
    }
  } catch (err) {
    console.log("pppp")
    res.status(401).json({ error: 'Invalid token' });
  }
});

async function distributeItems(postgamedata){
  const usermap = new Map()
  for(let round of postgamedata){
    const currUser = round.user;
    const currItem = round.item;
    const bid = round.bid;
    const {userid, username} = currUser;
    const balance = usermap.get(userid)
    const {name, value, url} =  currItem;

    if(balance){
      usermap.set(userid, balance+bid)
    }
    else{
      usermap.set(userid, bid)
    }
    const hashcode = crypto.createHash('sha256').update(name + userid).digest('hex'); //item hash composed of item name & userid
    const existingItem = await Item.findOne(
      {hashcode: hashcode}
    )
    if(existingItem){
      const result = await Item.findOneAndUpdate(
        { hashcode: hashcode},
        { $inc: { amount: 1 } }
      );
    }
    else{
      const newItem = new Item({
        hashcode: hashcode,
        name,
        value,
        url,
        amount: 1,
        owner: userid
      })
      await newItem.save()
    }
  }

  for(let key of usermap.keys()){
    const decrement = usermap.get(key)
    const result = await User.updateOne(
      { _id: key },
      { $inc: { balance: -decrement } }
    );
  }
}
 
  




const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || validateOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  }
});


io.use((socket, next) => {
  const { roomToken } = socket.handshake.auth;
  if (roomToken) {
    return jwt.verify(roomToken, process.env.ACCESS_TOKEN_SECRET, (err, session) => {
      if (err || !rooms.roomExist(session.roomid)) {
        return next(new Error("Authentication error"))
      }
      else{
        socket.session = session;
        return next();
      }
    });
  } 
  else {
    const rawCookie = socket.handshake.headers.cookie || "";

    const parsedCookies = cookie.parse(rawCookie)
    const userid  = socket.handshake.auth.userid;
    const accessToken = parsedCookies[`token_${userid}`]
    
    jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
      if (err) {
        return next(new Error("Authentication error"))
      }
      else{
      // console.log(user)
        socket.user = user;
        console.log(user)
        return next();
      }
    });
  }
});


io.on("connection", async (socket) => {
  let userID;
  let roomID;
  let currRoom;

  if (socket.session) {
    const { username, userid, roomid } = socket.session
    if (roomid) {
      const user = {
        userid,
        username,
        active: false
      }

      userID = user.userid
      roomID = roomid
      await rooms.joinPublicCode(user, roomid)
        .then(({ id, room }) => {
          room.setUserActiveStatus(false, user.userid, false)
          socket.join(id);
          currRoom = room;
          io.to(socket.id).emit('user data', { id: user.userid, username: user.username })

          setTimeout(() => {
            io.to(id).emit('user list', { userlist: room.users })
          }, "1000");

        })
        .catch(err => {
          console.error("Join failed:", err.message);
          socket.emit("error message", "Room not found or full");
        });
    }
  }
  else {
    const { userid, username } = socket.user
    console.log(username)

    const user = {
      userid,
      username,
      active: true
    }

    await rooms.joinRoom()
      .then(async ({ id, room }) => {
        userID = user.userid
        roomID = id
        currRoom = room;
        socket.join(id);
        room.join(user)

        const roomToken = generateRoomAccessToken(user, id)
        io.to(socket.id).emit("room token", { roomToken });
        setTimeout(() => {
          console.log(room.users)
          io.to(id).emit('user list', { userlist: room.users })
        }, "1000");

        if(room.users.length == 2) {
          room.postgame = [];
          handleGameLogic(room)
        }

      })
      .catch(err => {
        console.error("Join failed:", err.message);
        socket.emit("error message", "Room not found or full");
      });
  }


  socket.on("disconnect", async() => {
    console.log("left")
    rooms.leaveRoom(userID, roomID);
    if (rooms.roomExist(roomID)) {
      console.log("room exists")
      if (!currRoom.in_progress)
        io.to(roomID).emit('user list', { userlist: currRoom.users })
    }else{
      await redisclient.del([JSON.stringify(roomID)]);
    }

  });


});

async function handleGameLogic(room) {
  try{
    const secs = 18;
    const numofitems = room.items_for_bid.length;
    if (!room.private) {
      const handler = ({ user, balance, bid }) => {
        bidHandle(user, balance, bid, room);
      };

      let item_index = -1;
      io.to(room.id).emit("begin_game", { balance: room.maxBalance, bidOptions: room.bidOptions })
      const roomdata = {}
      room.users.forEach((user) => {
        roomdata[JSON.stringify(user.userid)] = room.maxBalance;
      })
      roomdata.highestbid_data = null;
      roomdata.currentItem = null;
      roomdata.postgame = [];
      room.highestbidder = {user: null, bid: null};
      await redisclient.set(JSON.stringify(room.id), JSON.stringify(roomdata)) 
      console.log("game begin")
      room.in_progress = true;

      let round = async () => {
        const sockets = await io.in(room.id).fetchSockets()
        item_index += 1;

        //assign won item to top bidder
        if (item_index > 0) {
          let data = await redisclient.get(JSON.stringify(room.id))
          data = JSON.parse(data)
          if (data.highestbid_data) {
            const { user, bid } = data.highestbid_data;

            if (user) {
              let originalBal = data[JSON.stringify(user.userid)];
              data[JSON.stringify(user.userid)] = originalBal - bid;
              
              data.postgame.push({ user, item: data.currentItem, bid })

              room.postgame.push({ user, item: data.currentItem, bid })
              io.to(room.id).emit("updated_balance", { userid: user.userid, balance: data[JSON.stringify(user.userid)] })
              data.highestbid_data = null;


              updateRedisData(room.id, data)
            }
            
            
          }
        }

        if (item_index >= room.items_for_bid.length) {

          let data = await redisclient.get(JSON.stringify(room.id));
          if(data){
            data = JSON.parse(data);
            console.log(data.postgame)
            distributeItems(data.postgame)
          }
      
          room.game_over = true;
          io.in(room.id).disconnectSockets();
          io.in(room.id).socketsLeave(room.id);
          console.log("game over")
          await redisclient.del(JSON.stringify(room.id))
        }
        else {
          let item = room.items_for_bid[item_index]
          
          let roomdata = await redisclient.get(JSON.stringify(room.id))

          roomdata = JSON.parse(roomdata);
          roomdata.currentItem = item;
          updateRedisData(room.id, roomdata)

          room.highestbidder = { user: null, bid: item.starting_bid }
          io.to(room.id).emit("current bid", { highestBidder: room.highestbidder, bidmessage: "" });
          itemBid(room, item, sockets, handler, secs)

        }
      };
      round()
      const interval = setInterval(round, secs * 1000)
      setTimeout(() => {
        clearInterval(interval);
      }, secs * 1000 * numofitems + 20);

  }
  }catch(error){

  }
}

function itemBid(room, item, sockets, handler, secs) {
  room.setUserActiveStatus(true, 0, true);
  io.to(room.id).emit('user list', { userlist: room.users })

  io.to(room.id).emit("setItem", { item, timer: secs-3 })
  for (let i = 0; i < sockets.length; i++) {
    sockets[i].off("bid", handler)
    sockets[i].on("bid", handler)
  }
}



const bidHandle = async (user, balance, bid, room) => {
  if (!(bid > balance) && (!room.highestbidder.user || user.userid != room.highestbidder.user.userid)) {
    if (room.getUserActiveStatus(user.userid)) {
      let data = await redisclient.get(JSON.stringify(room.id));
      data = JSON.parse(data);
      data.highestbid_data = { bid, user };
      updateRedisData(room.id, data)
      room.highestbidder.user = user;
      room.highestbidder.bid = bid;
      io.to(room.id).emit("current bid", { highestBidder: room.highestbidder, bidmessage: `I bid $${bid}, skibidi` });
    }
  }
}

async function updateRedisData(roomid, data) {
  try {
    await redisclient.set(JSON.stringify(roomid), JSON.stringify(data));
  } catch (error) {
    console.log(error)
  }
}


async function startServer() {
  try {
    await redisclient.connect();
    console.log('Connected to Redis');

    await mongoose.connect(process.env.MONGODB_URI)
    console.log("Connected to MongoDB Atlas")
    server.listen(3000, () => {
      console.log(`Server is running on port 3000`);
    });


  } catch (err) {
    console.error('Failed to start server:', err);
  }
}
startServer();