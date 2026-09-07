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
        userid: number,
        message: string
    };

    export interface CurrentBidPayload{
        bidder_id: number;
        bid_message: string;
        bid: number;
    }

    export interface UpdatedBalancePayload{
        userid: number,
        balance: number
    }

    export interface BeginGamePayload{
        balance: number,
        bidOptions: number[]
    }

    export interface UserData{
        userid: number,
        username: string
    }

    export type UserDataPayload = UserData;

    interface User{
        userid: number,
        username: string,
        active: boolean
    }
    export type Users = User[];

}