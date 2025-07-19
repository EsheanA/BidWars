const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const RoomGroup = require('./RoomRelated/RoomGroup');

const userRouter = require('./routes/userRoutes.js');
const cors = require('cors')
const jwt = require('jsonwebtoken')
const redis = require('redis');
const cookie = require("cookie");
require('dotenv').config()
const mongoose = require('mongoose');
const { generateAccessToken, generateRoomAccessToken } = require('../tokenHandling/generateToken');
const { v4: uuidv4 } = require("uuid");
const cookieParser = require('cookie-parser');


function validateOrigin(origin) {
  const originSlice = origin.slice(0, 17)
  // console.log(originSlice === "http://localhost:")
  if (originSlice === "http://localhost:") {
    return true;
  }
  return false;
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || validateOrigin(origin)) {
      return callback(null, true);
    }
    else
      return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json())
app.use(cookieParser());
app.use('/users', userRouter);


const rooms = new RoomGroup();
const redisclient = redis.createClient();

redisclient.on('error', err => console.log('Redis Client Error', err));


// const generateAccessToken = (user) => {
//   return jwt.sign({ userid: user.userid, username: user.username }, process.env.ACCESS_TOKEN_SECRET, {
//     expiresIn: "5m",
//   });
// };

// const generateRoomAccessToken = (user, roomid) => {
//   return jwt.sign({ userid: user.userid, username: user.username, roomid }, process.env.ACCESS_TOKEN_SECRET, {
//     expiresIn: "5m",
//   });
// }


const generateRefreshToken = (user) => {
  return jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET);
};




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

app.post('/createAccount', (req, res) => {
  const { username } = req.body;
  let newUser = {
    userid: `${uuidv4()}`,
    username
  }
  const accessToken = generateAccessToken(newUser)
  
  res.cookie(`token_${newUser.userid}`, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }).json({userid: newUser.userid, username: newUser.username});

  // res.json({ userid: newUser.userid, username: newUser.username, accessToken })
});




const io = new Server(server, {
  // cookie: true,
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

  
  // const parsedCookie = cookie.parse(rawCookie)
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
            // console.log(room.users)
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
    // console.log(socket.user)
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
        if (room.users.length == 2) {
          const roomdata = {}
          room.users.forEach((user) => {
            roomdata[JSON.stringify(user.userid)] = room.maxBalance;
          })
          roomdata.highestbid_data = null;
          roomdata.currentItem = null;
          roomdata.postgame = [];

          await redisclient.set(JSON.stringify(roomID), JSON.stringify(roomdata), 'EX', 300) // 300 seconds = 5 minute
          let value = await redisclient.get(JSON.stringify(roomID))
          value = JSON.parse(value);
          handleGameLogic(room)
        }
      })
      .catch(err => {
        console.error("Join failed:", err.message);
        socket.emit("error message", "Room not found or full");
      });
  }


  socket.on("disconnect", () => {
    console.log("left")
    rooms.leaveRoom(userID, roomID);
    if (rooms.roomExist(roomID)) {
      console.log("room exists")
      if (!currRoom.in_progress)
        io.to(roomID).emit('user list', { userlist: currRoom.users })
    }

  });


});

async function handleGameLogic(room) {
  const secs = 15;
  const numofitems = room.items_for_bid.length;
  if (!room.private) {
    const handler = ({ user, balance, bid }) => {
      bidHandle(user, balance, bid, room);
    };
    let item_index = -1;
    io.to(room.id).emit("begin_game", { balance: room.maxBalance, bidOptions: room.bidOptions })
    await redisclient.expire(JSON.stringify(room.id), secs * numofitems + 5)
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
            data.postgame.push({ user, won_item: data.item, bid })
            console.log("highest bidder: ")
            console.log(user)
            io.to(room.id).emit("updated_balance", { userid: user.userid, balance: data[JSON.stringify(user.userid)] })

          }
          data.highestbid_data = null;
          updateRedisData(room.id, data)
        }
      }

      if (item_index >= room.items_for_bid.length) {
        room.game_over = true;
        io.in(room.id).disconnectSockets();
        io.in(room.id).socketsLeave(room.id);
        console.log("game over")

        // if(!room.game_over){
        //   io.in(room.id).emit("game over", {farewell: "Auction has ended"})
        //   setTimeout(() => {
        //     room.game_over = true;
        //     io.in(room.id).disconnectSockets();
        //     io.in(room.id).socketsLeave(room.id);
        //     console.log("game over")
        //   }, 10*1000);
        // }
        // await redisclient.del(JSON.stringify(room.id))
        // clearInterval()
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
}

function itemBid(room, item, sockets, handler, secs) {
  room.setUserActiveStatus(true, 0, true);
  io.to(room.id).emit('user list', { userlist: room.users })

  io.to(room.id).emit("setItem", { item, timer: secs })
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
    const ttl = await redisclient.ttl(JSON.stringify(roomid))
    await redisclient.set(JSON.stringify(roomid), JSON.stringify(data), 'EX', ttl);
  } catch (error) {
    console.log(error)
  }
}

// server.listen(3000, () => {
//   console.log('listening on *:3000');
// });

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