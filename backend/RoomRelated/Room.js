const { v4: uuidv4 } = require("uuid");


class Room{
    constructor(){
        this.admin = null;
        this.id = uuidv4()
        this.users = [];
        this.items_for_bid = [
            // {
            //     name: "car.png"
            // },
            // {
            //     name: "goldtoilet.png"
            // },
            // {
            //     name: "fish.png"
            // },
            // {
            //     name: "dog.jpg"
            // },
            // {
            //     name: "switch.png"
            // },
            // {
            //     name: "gold.png"
            // },
            // {
            //     name: "jordans.png"
            // },
            // {
            //     name: "airpods.png"
            // },
            {
                name: "mario-kart.png"
            },
            {
                name: "brokensword.png"
            }

        ];
        this.maxBalance = 250;
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
    // setMinBid(bid){
    //     this.minBid = bid;
    // }
    kickUser(userId){
        this.users = this.users.filter(kickuser => kickuser.userid != userId)
    }
}
module.exports = Room;