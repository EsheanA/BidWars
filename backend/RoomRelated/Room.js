const { v4: uuidv4 } = require("uuid");


class Room{
    constructor(){
        this.admin = null;
        this.id = uuidv4()
        this.users = [];
        this.itemsForBid = [];
        this.minBid = 0;
        this.maxAllowance = 1000;
        this.private = false;
        this.roomCode = "";
        // this.time = null;
    }
    setAdminRoom(user){
        this.admin = user;
        this.private = true;
        this.roomCode = "ABC"
    }
    join(user){
        this.users.push(user);
    }
    setMinBid(bid){
        this.minBid = bid;
    }
    kickUser(userId){
        this.users = this.users.filter(kickuser => kickuser.userid != userId)
    }
}
module.exports = Room;