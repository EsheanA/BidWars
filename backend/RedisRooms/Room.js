const { v4: uuidv4 } = require("uuid");
const {generateItems} = require('../itemGeneration/generateItems')

class Room{

    constructor(auction){
        this.id = uuidv4()
        this.users = [];
        this.auction = auction;
        this.limit = 4;
        this.items = [];
        this.rounds = 3;
        this.in_progress = false;
        this.max = false
        this.itemData = {item: null, bidder_id: null, bid: null}
    }

   
}
module.exports = Room;