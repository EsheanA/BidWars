"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
const socket_io_1 = require("socket.io");
const auth_1 = require("./auth");
const GameLogic_1 = require("./GameLogic");
const RoomHandler_1 = __importDefault(require("../RedisRooms/RoomHandler"));
const generateToken_1 = require("../tokenHandling/generateToken");
async function initSocket(server, corsOpts) {
    await RoomHandler_1.default.initClient();
    const io = new socket_io_1.Server(server, {
        cors: corsOpts,
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
            skipMiddlewares: false,
        }
    });
    io.use(auth_1.socketAuth);
    io.on("connection", async (socket) => {
        let userID;
        let roomID;
        const auctionIndex = socket.auctionIndex;
        console.log(auctionIndex);
        try {
            if (socket.session) {
                const { userid, roomid } = socket.session;
                userID = userid;
                roomID = roomid;
                const user = await RoomHandler_1.default.getUser(userid);
                socket.join(roomid);
                if (user != null) {
                    await RoomHandler_1.default.toggleSingleUserActiveStatus(userid);
                }
            }
            else {
                if (!socket.user) {
                    throw new Error("Socket user is undefined");
                }
                if (!auctionIndex) {
                    throw new Error("Auction index is undefined");
                }
                const { userid, username } = socket.user;
                userID = userid;
                const roomid = await RoomHandler_1.default.findRoom(userid, username, auctionIndex);
                roomID = roomid;
                socket.join(roomid);
                const roomToken = (0, generateToken_1.generateRoomAccessToken)({ userid, username }, roomid);
                io.to(socket.id).emit("room token", {
                    roomToken
                });
                const users = await RoomHandler_1.default.getUsers(roomid);
                console.log("users: " + users);
                io.to(roomid).emit("user list", {
                    userlist: users
                });
                if (await RoomHandler_1.default.checkWhetherFull(roomid)) {
                    console.log("Begin Game!");
                    void (0, GameLogic_1.handleGameLogic)(io, roomid);
                }
            }
        }
        catch (error) {
            if (error instanceof Error) {
                console.error("Join failed:", error.message);
            }
            else {
                console.error("Join failed:", error);
            }
            socket.emit("error message", "Room not found or full");
        }
        socket.on("disconnect", async () => {
            try {
                console.log("left");
                if (!userID || !roomID) {
                    return;
                }
                if (await RoomHandler_1.default.checkGameStarted(roomID)) {
                    await RoomHandler_1.default.toggleSingleUserActiveStatus(userID);
                }
                else {
                    await RoomHandler_1.default.kickUser(userID, roomID);
                }
                const users = await RoomHandler_1.default.getUsers(roomID);
                if (users.length === 0) {
                    await RoomHandler_1.default.deleteRoom(roomID);
                }
                else {
                    io.to(roomID).emit("user list", {
                        userlist: users
                    });
                }
            }
            catch (error) {
                console.error("Disconnect error:", error);
            }
        });
    });
    return io;
}
//# sourceMappingURL=index.js.map