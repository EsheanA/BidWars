"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketAuth = void 0;
const cookie_1 = __importDefault(require("cookie"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const RoomHandler_1 = __importDefault(require("../RedisRooms/RoomHandler"));
const socketAuth = async (socket, next) => {
    try {
        const { roomToken } = socket.handshake.auth;
        const { auctionIndex } = socket.handshake.query;
        const secret = process.env.ACCESS_TOKEN_SECRET;
        if (!secret) {
            throw new Error("ACCESS_TOKEN_SECRET is undefined");
        }
        if (roomToken) {
            const session = jsonwebtoken_1.default.verify(roomToken, secret, {
                algorithms: ["HS256"]
            });
            if (!(await RoomHandler_1.default.checkGameStarted(session.roomid)) ||
                !(await RoomHandler_1.default.userExist(session.userid))) {
                console.log("game started/user doesn't exist error");
                next(new Error("Authentication error"));
                return;
            }
            socket.session = session;
            if (typeof auctionIndex === "string") {
                socket.auctionIndex = auctionIndex;
            }
            next();
            return;
        }
        console.log("Entering match");
        const rawCookie = socket.handshake.headers.cookie || "";
        const parsedCookies = cookie_1.default.parse(rawCookie);
        const userid = socket.handshake.auth.userid;
        const accessToken = parsedCookies[`token_${userid}`];
        if (!accessToken) {
            next(new Error("Authentication error"));
            return;
        }
        const user = jsonwebtoken_1.default.verify(accessToken, secret);
        socket.user = user;
        if (typeof auctionIndex === "string") {
            socket.auctionIndex = auctionIndex;
        }
        next();
    }
    catch (error) {
        console.error("Socket authentication error:", error);
        next(new Error("Authentication error"));
    }
};
exports.socketAuth = socketAuth;
//# sourceMappingURL=auth.js.map