import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { CorsOptions } from "cors";
import { JwtPayload } from "jsonwebtoken";

import { socketAuth } from "./auth";
import { handleGameLogic } from "./GameLogic";
import redisRoomHandler from "../RedisRooms/RoomHandler";
import { generateRoomAccessToken } from "../tokenHandling/generateToken";

interface SessionPayload extends JwtPayload {
    userid: string;
    username: string;
    roomid: string;
}

interface UserPayload extends JwtPayload {
    userid: string;
    username: string;
}

interface AuthSocket extends Socket {
    session?: SessionPayload;
    user?: UserPayload;
    auctionIndex?: number;
}

async function initSocket(
    server: HttpServer,
    corsOpts: CorsOptions
): Promise<Server> {
    await redisRoomHandler.initClient();

    const io = new Server(server, {
        cors: corsOpts,
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
            skipMiddlewares: false,
        }
    });

    io.use(socketAuth);

    io.on("connection", async (socket: AuthSocket) => {
        let userID: string | undefined;
        let roomID: string | undefined;

        const auctionIndex = socket.auctionIndex;

        console.log(auctionIndex);

        try {
            if (socket.session) {
                const { userid, roomid } = socket.session;

                userID = userid;
                roomID = roomid;

                const user = await redisRoomHandler.getUser(userid);

                socket.join(roomid);

                if (user != null) {
                    await redisRoomHandler.toggleSingleUserActiveStatus(userid);
                }

            } else {
                if (!socket.user) {
                    throw new Error("Socket user is undefined");
                }

                if (!auctionIndex) {
                    throw new Error("Auction index is undefined");
                }

                const { userid, username } = socket.user;

                userID = userid;

                const roomid = await redisRoomHandler.findRoom(
                    userid,
                    username,
                    auctionIndex
                );

                roomID = roomid;

                socket.join(roomid);

                const roomToken = generateRoomAccessToken(
                    { _id: userid, username },
                    roomid
                );

                io.to(socket.id).emit("room token", {
                    roomToken
                });

                const users = await redisRoomHandler.getUsers(roomid);

                console.log("users: " + users);

                io.to(roomid).emit("user list", {
                    userlist: users
                });

                if (await redisRoomHandler.checkWhetherFull(roomid)) {
                    console.log("Begin Game!");
                    void handleGameLogic(io, roomid);
                }
            }

        } catch (error) {
            if (error instanceof Error) {
                console.error("Join failed:", error.message);
            } else {
                console.error("Join failed:", error);
            }

            socket.emit(
                "error message",
                "Room not found or full"
            );
        }

        socket.on("disconnect", async (): Promise<void> => {
            try {
                console.log("left");

                if (!userID || !roomID) {
                    return;
                }

                if (await redisRoomHandler.checkGameStarted(roomID)) {
                    await redisRoomHandler.toggleSingleUserActiveStatus(userID);
                } else {
                    await redisRoomHandler.kickUser(userID, roomID);
                }

                const users = await redisRoomHandler.getUsers(roomID);

                if (users.length === 0) {
                    await redisRoomHandler.deleteRoom(roomID);
                } else {
                    io.to(roomID).emit("user list", {
                        userlist: users
                    });
                }

            } catch (error) {
                console.error("Disconnect error:", error);
            }
        });
    });

    return io;
}

export { initSocket };