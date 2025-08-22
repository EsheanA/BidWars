const { v4: uuidv4 } = require("uuid");
const auctionData = require("../auctions/auctionz.json")
const {generateItems} = require('../itemGeneration/generateItems')

class Room{

    constructor(auctionName, auctionIndex){
        this.id = uuidv4()
        this.users = [];
        this.auctionIndex = auctionIndex;
        this.auction = auctionName;
        this.limit = 2;
        this.items = [];
        this.bid_options = this.setBidOptions(auctionIndex);
        this.rounds = 3;
        this.in_progress = false;
        this.max = false
        this.itemData = {
            name: null, 
            value: null, 
            bid: null, 
            range: null, 
            description: null, 
            bidder_id: null,
            img_url: null,
            audio_url: null
        }
    }
    
    setBidOptions(auctionIndex){
        return(auctionData.auctions.mainline_auctions[auctionIndex].bid_options)
    }

   
}
module.exports = Room;