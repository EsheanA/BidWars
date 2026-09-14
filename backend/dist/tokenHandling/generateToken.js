"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRoomAccessToken = exports.generateAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const generateAccessToken = (user) => {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret) {
        throw new Error("ACCESS_TOKEN_SECRET is undefined");
    }
    return jsonwebtoken_1.default.sign({
        userid: user.userid,
        username: user.username
    }, secret, {
        expiresIn: "20m"
    });
};
exports.generateAccessToken = generateAccessToken;
const generateRoomAccessToken = (user, roomid) => {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret) {
        throw new Error("ACCESS_TOKEN_SECRET is undefined");
    }
    return jsonwebtoken_1.default.sign({
        userid: user.userid,
        username: user.username,
        roomid
    }, secret, {
        expiresIn: "5m"
    });
};
exports.generateRoomAccessToken = generateRoomAccessToken;
//# sourceMappingURL=generateToken.js.map