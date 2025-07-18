const { v4: uuidv4 } = require("uuid");


class Room{
    constructor(){
        this.admin = null;
        this.id = uuidv4()
        this.users = [];
        this.in_progress = false;
        this.game_over = false;
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
    kickUser(userid){
        this.users = this.users.filter(kickuser => kickuser.userid != userid)
    }
    setUserActiveStatus(all, userid, status){
        for(let i = 0; i<this.users.length; i++){
            if(all || userid == this.users[i].userid){
                this.users[i].active = status;
            }
        }
    }
    getUserActiveStatus(userid){
        for(let i = 0; i<this.users.length; i++){
            if(userid == this.users[i].userid){
                return(this.users[i].active);
            }
        }
        return false;
    }
}
module.exports = Room;