const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const RoomGroup = require('./RoomRelated/RoomGroup');
const cors = require('cors')
app.use(cors())


const rooms = new RoomGroup();

app.get('/', (req, res) => {
    res.status(200).send('Server is up');
  });

const io = new Server(server, {
    cors: {
      origin: "*", 
      methods: ['GET', 'POST'],
      credentials: true
    }
});

io.on("connection", async (socket) => {
    const {userid, username} = socket.handshake.query;
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