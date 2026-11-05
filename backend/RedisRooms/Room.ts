import { uuid } from 'uuidv4';
import { getAuction } from "../auctions/auctionIndex";
import { type Item } from '../types/Auction';
import { type RoomUser } from '../types/User';

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
        getAuction(auctionIndex);
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
        return getAuction(auctionIndex).bid_options;
    }

   
}
export default Room;