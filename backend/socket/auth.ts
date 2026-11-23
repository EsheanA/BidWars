import * as cookie from "cookie";
import { verifyAccessToken, verifyRoomAccessToken } from "../tokenHandling/verifyToken";
import type { AuthSocket } from "./types";

import { parseAuctionIndex, InvalidAuctionIndexError } from "../auctions/auctionIndex";

import redisRoomHandler from "../RedisRooms/RoomHandler";

export const socketAuth = async (
    socket: AuthSocket,
    next: (err?: Error) => void
): Promise<void> => {
    try {
        const { roomToken } = socket.handshake.auth as {
            roomToken?: string;
            userid?: string;
        };

        const { auctionIndex } = socket.handshake.query;
        // Reconnects identify their existing room through the signed session.
        const normalizedIndex = roomToken && auctionIndex === undefined
            ? undefined : parseAuctionIndex(auctionIndex);

        const userid = socket.handshake.auth.userid;
        if (roomToken) {
            const session = verifyRoomAccessToken(roomToken, userid);

            if (
                !(await redisRoomHandler.checkGameStarted(session.roomid)) ||
                !(await redisRoomHandler.userExist(session.userid))
            ) {
                console.log("game started/user doesn't exist error");
                next(new Error("Authentication error"));
                return;
            }

            const player = await redisRoomHandler.getUser(session.userid);
            const participants = await redisRoomHandler.getUsers(session.roomid);
            if (player.roomid !== session.roomid || !participants.some(user => user.userid === session.userid)) {
                throw new Error("Authentication error");
            }
            socket.session = session;

            if (normalizedIndex !== undefined) {
                socket.auctionIndex = normalizedIndex;
            }

            next();
            return;
        }

        console.log("Entering match");

        const rawCookie: string = socket.handshake.headers.cookie || "";
        const parsedCookies = cookie.parse(rawCookie);

        const accessToken: string | undefined =
            parsedCookies[`token_${userid}`];

        if (!accessToken) {
            next(new Error("Authentication error"));
            return;
        }

        const user = verifyAccessToken(accessToken, userid);

        socket.user = user;

        if (normalizedIndex !== undefined) {
            socket.auctionIndex = normalizedIndex;
        }

        next();

    } catch (error) {
        console.error("Socket authentication error:", error);
        next(error instanceof InvalidAuctionIndexError ? error : new Error("Authentication error"));
    }
};