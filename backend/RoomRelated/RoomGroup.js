
// import Room from './Room.js'
const Room = require("./Room");
const ROOM_MAX_CAPACITY = 4;
class RoomGroup{
    constructor(){
        this.rooms = [];
        this.privateRooms = new Map();
    }

    createRoom(user){
        let newRoom = new Room();
        newRoom.setAdminRoom(user);
        let room_code = "ABC";
        this.privateRooms.set(room_code, newRoom);
    }
    joinCode(user,str){
        let foundRoom = this.privatesRooms.get(str);
        if(foundRoom && foundRoom.users.length < (ROOM_MAX_CAPACITY+1)){
            foundRoom.join(user);
            return(resolve({id: foundRoom.id, room: foundRoom}))
        }
    }
    joinRoom(){
        for(let room in this.rooms){
            if(room.users.length < ROOM_MAX_CAPACITY){
                return resolve({id: room.id,room});
            }
            else{
                let newRoom = newRoom();
                this.rooms.push(newRoom);
                return resolve({id: newRoom.id, room})
            }
        }
    }
    leaveRoom(userID, roomId){
        console.log("left")
        this.rooms = this.rooms.filter((room) => {
          if (room.id === roomId) {
            room.kickUser(userID)
            if(room.users == 0){
                return false
            }
          }
          return true;
        });
    }
}

module.exports = RoomGroup;