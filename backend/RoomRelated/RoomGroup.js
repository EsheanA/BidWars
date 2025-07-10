
// import Room from './Room.js'
const Room = require("./Room");
const ROOM_MAX_CAPACITY = 4;
class RoomGroup{
    constructor(){
        this.rejoinRooms = new Map()
        this.rooms = [];
        this.privateRooms = new Map();
    }

    // createRoom(user){
    //     let newRoom = new Room();
    //     newRoom.setAdminRoom(user);
    //     let room_code = "ABC";
    //     this.privateRooms.set(room_code, newRoom);
    // }

    joinPrivateCode(user,str){
        return new Promise((resolve, reject) =>{
            let foundRoom = this.privatesRooms.get(str);
            if(foundRoom && foundRoom.users.length < (ROOM_MAX_CAPACITY+1)){
                foundRoom.join(user);
                return(resolve({id: foundRoom.id, room: foundRoom}))
            }
            else{
                return reject(new Error("room not found"))
            }
        })
    }
    joinPublicCode(user,str){
        return new Promise((resolve, reject) =>{
            let foundRoom = this.rejoinRooms.get(str);
            if(foundRoom && foundRoom.users.length < (ROOM_MAX_CAPACITY)){
                foundRoom.join(user);
                return(resolve({id: foundRoom.id, room: foundRoom}))
            }
            else{
                return reject(new Error("room not found"))
            }
        })
    }
    roomExist(roomid){
        const room = this.rejoinRooms.get(roomid);
        return((room) ? !room.game_over : false)
    }
    joinRoom(){
        return new Promise((resolve) =>{
            for(let room of this.rooms){
                if(room.users.length < ROOM_MAX_CAPACITY){
                    return resolve({id: room.id,room});
                }
            }
            let newRoom = new Room();
            this.rooms.push(newRoom);
            this.rejoinRooms.set(newRoom.id, newRoom);
            return resolve({id: newRoom.id, room: newRoom})
        })
    }
    leaveRoom(userID, roomId){
        this.rooms = this.rooms.filter((room) => {
          if (room.id === roomId) {
            room.kickUser(userID)
            if(room.users.length == 0){
                this.rejoinRooms.delete(roomId)
                return false
            }
          }
          return true;
        });
    }
}

module.exports = RoomGroup;