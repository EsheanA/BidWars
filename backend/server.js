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
  return jwt.sign({ userid: user.userid, username: user.username }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "5m",
  });
};

const generateRoomAccessToken = (user, roomid) => {
  return jwt.sign({ userid: user.userid, username: user.username, roomid }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "5m",
  });
}
const generateRefreshToken = (user) => {
  return jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET);
};




app.get('/', (req, res) => {
  res.status(200).send('Server is up');
});

app.post('/createAccount', (req, res) => {
  const { username } = req.body;
  let newUser = {
    userid: `${uuidv4()}`,
    username
  }
  const accessToken = generateAccessToken(newUser)
  userdb.push(newUser);
  res.json({ userid: newUser.userid, username: newUser.username, accessToken })
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
  const { roomToken } = socket.handshake.auth;
  if (roomToken) {
    jwt.verify(roomToken, process.env.ACCESS_TOKEN_SECRET, (err, session) => {
      if (err || !rooms.roomExist(session.roomid)) {
        next(new Error("Authentication error"))
      }
      socket.session = session;
      next();
    });
  } else {
    const { accessToken } = socket.handshake.auth;
    jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
      if (err) {
        next(new Error("Authentication error"))
      }
      console.log(user)
      socket.user = user;
      next();
    });

  }
});


io.on("connection", async (socket) => {
  let userID;
  let roomID;
  let currRoom;
  // const {roomToken} = socket.handshake.auth
  if (socket.session) {
    const { username, userid, roomid } = socket.session
    if (roomid) {
      const user = {
        userid,
        username
      }
      userID = user.userid
      roomID = roomid
      await rooms.joinPublicCode(user, roomid)
        .then(({ id, room }) => {

          socket.join(id);
          currRoom = room;
          io.to(socket.id).emit('user data', { id: user.userid, username: user.username })
          setTimeout(() => {
            console.log(room.users)
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
    // const { id, room } = await rooms.joinRoom();
    const user = {
      userid,
      username
    }
    await rooms.joinRoom()
      .then(({ id, room }) => {
        userID = user.userid
        roomID = id
        currRoom = room;
        socket.join(id);
        room.join(user)

        const roomToken = generateRoomAccessToken(user, id)
        io.to(socket.id).emit("room token", { roomToken });
        io.to(id).emit('user list', { userlist: room.users })
        setTimeout(() => {
          console.log(room.users)
          io.to(id).emit('user list', { userlist: room.users })
        }, "1000");
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
      io.to(roomID).emit('user list', { userlist: currRoom.users })
    }
  });

});

server.listen(3000, () => {
  console.log('listening on *:3000');
});