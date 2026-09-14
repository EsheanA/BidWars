import { type Item } from "./Auction";
export interface User{
    _id: string,
    username: string,
    passwordHash: string,
    balance: number
}

export interface RoomUser{
    userid: string;
    username: string;
    active: boolean;
}

export interface RedisUser{
    roomid: string;
    username: string;
    active: boolean;
    balance: number;
    items: Array<Item>
}