import * as cookie from "cookie";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Socket } from "socket.io";

import { parseAuctionIndex, InvalidAuctionIndexError } from "../auctions/auctionIndex";

import redisRoomHandler from "../RedisRooms/RoomHandler";

interface SessionPayload extends JwtPayload {
    userid: string;
    username: string;
    roomid: string;
}

interface AuthSocket extends Socket {
    session?: SessionPayload;
    user?: string | JwtPayload;
    auctionIndex?: number;
}

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

        const secret = process.env.ACCESS_TOKEN_SECRET;

        if (!secret) {
            throw new Error("ACCESS_TOKEN_SECRET is undefined");
        }

        if (roomToken) {
            const session = jwt.verify(
                roomToken,
                secret,
                {
                    algorithms: ["HS256"]
                }
            ) as SessionPayload;

            if (
                !(await redisRoomHandler.checkGameStarted(session.roomid)) ||
                !(await redisRoomHandler.userExist(session.userid))
            ) {
                console.log("game started/user doesn't exist error");
                next(new Error("Authentication error"));
                return;
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

        const userid = socket.handshake.auth.userid as string;
        const accessToken: string | undefined =
            parsedCookies[`token_${userid}`];

        if (!accessToken) {
            next(new Error("Authentication error"));
            return;
        }

        const user = jwt.verify(accessToken, secret);

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