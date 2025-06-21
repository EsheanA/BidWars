const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const RoomGroup = require('./RoomGroup');
const cors = require('cors')
app.use(cors())


const rooms = new RoomGroup();


const io = new Server(server, {
    cors: {
      origin: "*", 
      methods: ['GET', 'POST'],
      credentials: true
    }
});

io.on("connection", async (socket) => {
    const {id, room} = await room_group.joinRoom();
    socket.join(id);
    console.log(id)
    // io.to(socket.id).emit('previous messages', room.messages)
    // socket.on("chat message", (msg) => {
    //     room.messages.push(msg)
    //     io.to(id).emit('receive message', msg);
    // });
    socket.on("disconnect", () => {
        room_group.leaveRoom(id);
    });
});

server.listen(3000, () => {
    console.log('listening on *:3000');
  });