const redisRoomHandler = require("../RedisRooms/RoomHandler");



async function itemBid(roomid, item, io, sockets, handler, round, secs, start, interval) {
  try{

    console.log("roomid: ", roomid)
    console.log("item: ", item)
    const {users} = await redisRoomHandler.toggleUsersActiveStatus(roomid)
    const parsed_users = JSON.parse(users)

    console.log("interval: ", interval)

    io.to(roomid).emit('user list', { userlist: parsed_users })
    const end = Date.now()
    const timeBetween = end-start;
    console.log(timeBetween)

    await increaseTimer(round, interval, secs)
    io.to(roomid).emit("setItem", JSON.stringify({ item, timer: secs}))

    for (let i = 0; i < sockets.length; i++) {
      sockets[i].off("bid", handler)
      sockets[i].on("bid", handler)
    }
  }catch(error){
    console.error("error with itemBid: ", error)
  }
}

async function handleGameLogic(io, roomid) {

  try {

    const pregame_data = await redisRoomHandler.getPreGameData(roomid);
    const { rounds, max_balance, item_data, category, bid_options} = JSON.parse(pregame_data);
    var new_item = item_data;
    const secs = 20;
    console.log(`rounds: ${rounds}, max_balance: $${max_balance}, bid_options: ${bid_options}, category: ${category}`,);

    const handler = ({ user, bid }) => {
       console.log("user: ", user)
       console.log(`bid: ${bid}`)
    };

    io.to(roomid).emit("begin_game", { balance: max_balance, bidOptions: bid_options })

    // const users = await redisRoomHandler.getUsers(roomid)
    var current_round = rounds;
    await redisRoomHandler.startGame(roomid)

    const sockets = await io.in(roomid).fetchSockets();

    let round = async(interval) => {
      const start = Date.now()
      if(current_round != rounds) {
        await redisRoomHandler.awardItem(roomid);
      }
      if(current_round <= 0){
        console.log("game over")
        io.in(roomid).disconnectSockets();
        io.socketsLeave(roomid);
        clearInterval(interval)
      }else{
        var parsed_item_data = new_item;

        if(current_round != rounds){ //here we say: if we aren't on the first round
          new_item = await redisRoomHandler.setItem(roomid);
          parsed_item_data = JSON.parse(new_item).item_data
        }

        const {name, value, bid, range, description, audio_url, img_url, bidder_id} = parsed_item_data;
        const item = {name, value, bid, description, audio_url, img_url, category: parsed_item_data.category};

        await itemBid(roomid, item, io, sockets, handler, round, secs, start, interval)
        current_round-=1;
      }
      

    }
   await startTimer(round, secs)

    // setTimeout(() => {
    //   clearInterval(interval);
    // }, 140*1000);



  }catch(error) {

  }
  
}
async function startTimer(round, secs){
    const local_interval = setInterval(async () => {
      await round(local_interval);
    }, (secs * 1000));
    await round(local_interval);
}
async function increaseTimer(round, interval, secs){
  clearInterval(interval)
  const local_interval = setInterval(async () => {
    await round(local_interval);
  }, (secs+1) * 1000);
}


// function itemBid(room, item, sockets, handler, secs) {
//   room.setUserActiveStatus(true, 0, true);
//   io.to(room.id).emit('user list', { userlist: room.users })

//   io.to(room.id).emit("setItem", { item, timer: secs - 3 })
//   for (let i = 0; i < sockets.length; i++) {
//     sockets[i].off("bid", handler)
//     sockets[i].on("bid", handler)
//   }
// }



// const bidHandle = async (user, balance, bid, room) => {
//   if (!(bid > balance) && (!room.highestbidder.user || user.userid != room.highestbidder.user.userid)) {
//     if (room.getUserActiveStatus(user.userid)) {
//       let data = await redisclient.get(JSON.stringify(room.id));
//       data = JSON.parse(data);
//       data.highestbid_data = { bid, user };
//       updateRedisData(room.id, data)
//       room.highestbidder.user = user;
//       room.highestbidder.bid = bid;
//       io.to(room.id).emit("current bid", { highestBidder: room.highestbidder, bidmessage: `I bid $${bid}, skibidi` });
//     }
//   }
// }

module.exports = {handleGameLogic}