import jwt from "jsonwebtoken";
import { type RoomAccessTokenUser, type AccessTokenUser } from "../types/Token";

export const generateAccessToken = (user: AccessTokenUser): string => {
    const secret = process.env.ACCESS_TOKEN_SECRET;

    if (!secret) {
        throw new Error("ACCESS_TOKEN_SECRET is undefined");
    }

    return jwt.sign(
        {
            userid: user._id.toString(),
            username: user.username,
            purpose: "access"
        },
        secret,
        {
            algorithm: "HS256",
            expiresIn: "20m"
        }
    );
};

export const generateRoomAccessToken = (
    user: RoomAccessTokenUser,
    roomid: string
): string => {
    const secret = process.env.ACCESS_TOKEN_SECRET;

    if (!secret) {
        throw new Error("ACCESS_TOKEN_SECRET is undefined");
    }

    return jwt.sign(
        {
            userid: user._id.toString(),
            username: user.username,
            roomid,
            purpose: "room"
        },
        secret,
        {
            algorithm: "HS256",
            expiresIn: "5m"
        }
    );
};