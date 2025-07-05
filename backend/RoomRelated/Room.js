const { v4: uuidv4 } = require("uuid");


class Room{
    constructor(){
        this.admin = null;
        this.id = uuidv4()
        this.users = [];
        this.highestbidder = null;
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
            {
                url: "gold.png",
                name:"gold",
                starting_bid: 200,
                value: 300
            },
            // {
            //     name: "jordans.png"
            // },
            // {
            //     name: "airpods.png"
            // },
            {
                url: "mario-kart.png",
                name : "mario_kart",
                starting_bid: 50,
                value : 100
            },
            {
                url: "brokensword.png",
                name : "broken_sword",
                starting_bid:15,
                value : 35
            }

        ];
        this.maxBalance = 250;
        this.bidOptions = [5, 10, 20];
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