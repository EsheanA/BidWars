import { uuid } from 'uuidv4';
import auctionData from "../auctions/auctionz.json";
import { type Item } from '../types/Auction';
import { type RoomUser } from '../types/User';
import { type Auction } from '../types/Auction';

class Room{
    id: string;
    users: Array<RoomUser>;
    auctionIndex: number;
    auction: string;
    limit: number;
    items: Array<Item>;
    bid_options: number[];
    rounds: number;
    in_progress: boolean;
    max: boolean;
    itemData: Item | null;
    
    constructor(auctionName : string, auctionIndex : number){
        this.id = uuid()
        this.users = [];
        this.auctionIndex = auctionIndex;
        this.auction = auctionName;
        this.limit = 2;
        this.items = [];
        this.bid_options = this.setBidOptions(auctionIndex);
        this.rounds = 3;
        this.in_progress = false;
        this.max = false
        this.itemData = null;
    }
    
    setBidOptions(auctionIndex : number) : number[]{
        const mainline_auctions = auctionData.auctions.mainline_auctions as Array<Auction>;
        return(mainline_auctions[auctionIndex]?.bid_options as number[]);
    }

   
}
export default Room;