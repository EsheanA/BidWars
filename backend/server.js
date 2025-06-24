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
// const { ref } = require('process');

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

const generateRefreshToken = (user) => {
  return jwt.sign({ id: user.id}, process.env.REFRESH_TOKEN_SECRET);
};

// function authenticateToken(req, res, next) {
//   const authHeader = req.headers['authorization']
//   const token = authHeader && authHeader.split(' ')[1]
//   if (token == null) return res.sendStatus(401)

//   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
//     console.log(err)
//     if (err) return res.sendStatus(403)
//     req.user = user
//     next()
//   })
// }



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
});

function authenticateToken(token) {
  // const authHeader = req.headers['authorization']
  // const token = authHeader && authHeader.split(' ')[1]
  if (token == null) return res.sendStatus(401)
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    console.log(err)
    if (err) return res.sendStatus(403)
    req.user = user
    next()
  })
}

io.use((socket, next) => {
  try{
    
    const {accessToken} = socket.handshake.auth;
    const user = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
    socket.user = user;
    console.log(socket.user)
    next()
  }catch(error){
    console.log("error")
    next(new Error("Authentication error"))
  }
});


io.on("connection", async (socket) => {
    // const {userid, username} = socket.handshake.auth;
    const {userid, username} = socket.user
    const {id, room} = await rooms.joinRoom();
    const user = {
        id: userid,
        username
    }
    socket.join(id);
    room.join(user)
    console.log(id)
    io.to(id).emit('user list', {userlist: room.users})

    socket.on("disconnect", () => {
        rooms.leaveRoom(userid, id);
        io.to(id).emit('user list', {userlist: room.users})
    });
});

server.listen(3000, () => {
    console.log('listening on *:3000');
  });