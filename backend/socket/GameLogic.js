const redisRoomHandler = require("../RedisRooms/RoomHandler");



async function itemBid(roomid, item, io, sockets, handler, secs, start) {
  try{
    console.log("roomid: ", roomid)
    console.log("item: ", item)
    const {users} = await redisRoomHandler.toggleUsersActiveStatus(roomid)
    const parsed_users = JSON.parse(users)

    io.to(roomid).emit('user list', { userlist: parsed_users })
    const end = Date.now()
    const timeBetween = end-start;
    console.log(timeBetween)
    // if(interval){
    //   setTimeout(() => {
    //     interval
    //   }, timeIncrease);
    // }

    io.to(roomid).emit("setItem", JSON.stringify({ item, timer: secs-15}))

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
    const secs = 30;
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

    let round = async() => {
      const start = Date.now()
      if(current_round != rounds) {
        await redisRoomHandler.awardItem(roomid);
      }
      if(current_round <= 0){
        console.log("game over")
        io.in(roomid).disconnectSockets();
        io.socketsLeave(roomid);

      }else{
        var parsed_item_data = new_item;

        if(current_round != rounds){ //here we say: if we aren't on the first round
          new_item = await redisRoomHandler.setItem(roomid);
          parsed_item_data = JSON.parse(new_item).item_data
        }

        const {name, value, bid, range, description, audio_url, img_url, bidder_id} = parsed_item_data;
        const item = {name, value, bid, description, audio_url, img_url, category: parsed_item_data.category};

        await itemBid(roomid, item, io, sockets, handler, secs, start)
        current_round-=1;
      }
      

    }
    round()
    // interval = setInterval(await round, secs * 1000)
    const interval = setInterval(async () => {
      console.log(`Round ${current_round}`)
      await round();
    }, secs * 1000);
    // setTimeout(() => {
    //   clearInterval(interval);
    // }, ((secs * 1000*3) + 100));
    setTimeout(() => {
      clearInterval(interval);
    }, 140*1000);

  //   let round = async () => {

  //     const sockets = await io.in(room.id).fetchSockets()

  //     //assign won item to top bidder
  //     if (item_index > 0) {
  //       let data = await redisclient.get(JSON.stringify(room.id))
  //       data = JSON.parse(data)
  //       if (data.highestbid_data) {
  //         const { user, bid } = data.highestbid_data;

  //         if (user) {
  //           let originalBal = data[JSON.stringify(user.userid)];
  //           data[JSON.stringify(user.userid)] = originalBal - bid;

  //           data.postgame.push({ user, item: data.currentItem, bid })

  //           room.postgame.push({ user, item: data.currentItem, bid })
  //           io.to(room.id).emit("updated_balance", { userid: user.userid, balance: data[JSON.stringify(user.userid)] })
  //           data.highestbid_data = null;


  //           updateRedisData(room.id, data)
  //         }


  //       }
  //     }

  //     if (item_index >= room.items_for_bid.length) {

  //       let data = await redisclient.get(JSON.stringify(room.id));
  //       if (data) {
  //         data = JSON.parse(data);
  //         distributeItems(data.postgame)
  //       }

  //       room.game_over = true;
  //       io.in(room.id).disconnectSockets();
  //       io.in(room.id).socketsLeave(room.id);
  //       console.log("game over")
  //       await redisclient.del(JSON.stringify(room.id))
  //     }
  //     else {
  //       let item = room.items_for_bid[item_index]

  //       let roomdata = await redisclient.get(JSON.stringify(room.id))

  //       roomdata = JSON.parse(roomdata);
  //       roomdata.currentItem = item;
  //       updateRedisData(room.id, roomdata)

  //       room.highestbidder = { user: null, bid: item.starting_bid }
  //       io.to(room.id).emit("current bid", { highestBidder: room.highestbidder, bidmessage: "" });
  //       itemBid(room, item, sockets, handler, secs)

  //     }
  //   };
  //   round()
  //   const interval = setInterval(round, secs * 1000)
  //   setTimeout(() => {
  //     clearInterval(interval);
  //   }, secs * 1000 * rounds + 20);

  }catch(error) {

  }
  
}
function timer(secs, interval){
  setTimeout(() => {
    clearInterval(interval);
  }, ((secs * 1000*3) + 100));
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