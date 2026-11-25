import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { CorsOptions } from "cors";
import type { AuthSocket } from "./types";

import { assertAuctionIndex, InvalidAuctionIndexError } from "../auctions/auctionIndex";

import { socketAuth } from "./auth";
import { handleGameLogic, cancelAbandonedGame, stopAllGames } from "./GameLogic";
import redisRoomHandler from "../RedisRooms/RoomHandler";
import { generateRoomAccessToken } from "../tokenHandling/generateToken";

const shutdowns = new WeakMap<Server, () => Promise<void>>();

export function closeSocket(io: Server): Promise<void> {
    return shutdowns.get(io)!();
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

    let stopping = false;
    let closing: Promise<void> | undefined;
    const pending = new Set<Promise<void>>();
    const track = (task: Promise<void>) => {
        pending.add(task);
        void task.then(() => pending.delete(task), () => pending.delete(task));
        return task;
    };
    shutdowns.set(io, () => closing ??= (async () => {
        stopping = true;
        const gamesClosed = stopAllGames();
        const socketsClosed = new Promise<void>((resolve, reject) => {
            void io.close(error => {
                if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
                else resolve();
            }).catch(reject);
        });
        const results = await Promise.allSettled([gamesClosed, socketsClosed]);
        while (pending.size) await Promise.allSettled([...pending]);
        for (const result of results) if (result.status === 'rejected') throw result.reason;
    })());

    io.use(socketAuth);

    const onConnection = async (socket: AuthSocket): Promise<void> => {
        if (stopping) { socket.disconnect(true); return; }
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
                const participants = await redisRoomHandler.getUsers(roomid);
                if (user.roomid !== roomid || !participants.some(participant => participant.userid === userid)) {
                    throw new Error("Authentication error");
                }

                if (stopping) return;
                await socket.join(roomid);
                socket.data.userid = userid;
                socket.data.roomid = roomid;

                if (user != null) {
                    await redisRoomHandler.toggleSingleUserActiveStatus(userid);
                }

            } else {
                if (!socket.user) {
                    throw new Error("Socket user is undefined");
                }

                assertAuctionIndex(auctionIndex);

                const { userid, username } = socket.user;

                userID = userid;

                const roomid = await redisRoomHandler.findRoom(
                    userid,
                    username,
                    auctionIndex
                );

                roomID = roomid;
                const player = await redisRoomHandler.getUser(userid);
                const users = await redisRoomHandler.getUsers(roomid);
                if (player.roomid !== roomid || !users.some(participant => participant.userid === userid)) {
                    throw new Error("Authentication error");
                }

                if (stopping) return;
                await socket.join(roomid);
                socket.data.userid = userid;
                socket.data.roomid = roomid;

                const roomToken = generateRoomAccessToken(
                    { _id: userid, username },
                    roomid
                );

                io.to(socket.id).emit("room token", {
                    roomToken
                });

                console.log("users: " + users);

                io.to(roomid).emit("user list", {
                    userlist: users
                });

                if (await redisRoomHandler.checkWhetherFull(roomid) && !stopping) {
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
                error instanceof InvalidAuctionIndexError ? error.message : "Room not found or full"
            );
        }

        const onDisconnect = async (): Promise<void> => {
            if (stopping) return;
            if (roomID) cancelAbandonedGame(io, roomID);
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
        };
        socket.on('disconnect', () => track(onDisconnect()));
    };
    io.on('connection', (socket: AuthSocket) => track(onConnection(socket)));

    return io;
}

export { initSocket };
