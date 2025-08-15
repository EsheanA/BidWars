const { v4: uuidv4 } = require("uuid");
const {generateItems} = require('../itemGeneration/generateItems')

class Room{

    constructor(){
        this.admin = null;
        this.id = uuidv4()
        this.users = [];
        this.in_progress = false;
        this.game_over = false;
        this.highestbidder = null;
        this.items_for_bid = generateItems("$250_auction");
        this.maxBalance = 250;
        this.bidOptions = [5, 10, 20];
        this.private = false;
        this.roomCode = "";
    }

    setAdminRoom(user){
        this.admin = user;
        this.private = true;
        this.roomCode = "ABC"
    }

    join(user){
        this.users.push(user);
    }

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