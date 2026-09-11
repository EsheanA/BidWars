export namespace Home{
    export interface Auction{
        name: string,
        image: string,
        start: number,
        end: number,
        color: string,
        items: Array<string>
    }
    export interface AuctionListPayload{
        auctions: Array<Auction>
    }
};