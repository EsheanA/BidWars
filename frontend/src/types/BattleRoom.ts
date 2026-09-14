import { type User } from "./User.js"
export namespace BR{
    export interface BidItem{
        name: string,
        value: number,
        description: string,
        audio_url: string,
        img_url: string,
        range: string
        rarity: number
    }

    export interface SetItemPayload{
        item: BidItem & {bid: number};
        timer: number;
    }

    export interface HighestBidder{
        userid: User["userid"],
        message: string
    };

    export interface CurrentBidPayload{
        bidder_id: string;
        bid_message: string;
        bid: number;
    }

    export interface UpdatedBalancePayload{
        userid: User["userid"],
        balance: number
    }

    export interface BeginGamePayload{
        balance: number,
        bidOptions: number[]
    }

    export interface UserData{
        userid: User["userid"],
        username: string
    }

    export type UserDataPayload = UserData;

    export interface User{
        userid: string,
        username: string,
        active: boolean
    }

    export type Users = User[];

    export interface UsersPayload{
        userlist: Users;
    }

    export interface TokenPayload{
        roomToken: string;
    }
}