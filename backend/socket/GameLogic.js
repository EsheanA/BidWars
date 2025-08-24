const redisRoomHandler = require("../RedisRooms/RoomHandler");



async function itemBid(roomid, item, io, sockets, handler, round, secs, start) {
  try {
    const { users } = await redisRoomHandler.toggleUsersActiveStatus(roomid)
    const parsed_users = JSON.parse(users)


    io.to(roomid).emit('user list', { userlist: parsed_users })
    const end = Date.now()
    const timeBetween = end - start;

    io.to(roomid).emit("setItem", JSON.stringify({ item, timer: secs }))

    setTimeout(() => {
      round()
    }, secs * 1000);

    for (let i = 0; i < sockets.length; i++) {
      sockets[i].off("bid", handler)
      sockets[i].on("bid", handler)
    }
  } catch (error) {
    console.error("error with itemBid: ", error)
  }
}

const handleBid = async (userid, bid, io) => {
  try{
    const data = await redisRoomHandler.handleBid(userid, bid);
    const parsed_data = JSON.parse(data);
    if(parsed_data.userid){
      io.to(parsed_data.roomid).emit("current bid", { bidder_id: parsed_data.userid, bid, bid_message: `I bid $${bid}, skibidi` });
    }
  }catch(error){
    console.error(error)
  }
}

async function handleGameLogic(io, roomid) {

  try {

    const pregame_data = await redisRoomHandler.getPreGameData(roomid);
    const { rounds, max_balance, item_data, category, bid_options } = JSON.parse(pregame_data);
    var new_item = item_data;
    const secs = 20;
    // console.log(`rounds: ${rounds}, max_balance: $${max_balance}, bid_options: ${bid_options}, category: ${category}`,);


    const handler = ({userid, bid }) => {
      handleBid(userid, bid, io);
    };
    io.to(roomid).emit("begin_game", { balance: max_balance, bidOptions: bid_options })

    var current_round = rounds;
    await redisRoomHandler.startGame(roomid)

    const sockets = await io.in(roomid).fetchSockets();

    let round = async () => {

      console.log("Round: ", current_round)
      const start = Date.now()

      if (current_round != rounds && current_round >= 0) {
        await redisRoomHandler.distributeItemDB(roomid);
        const data = await redisRoomHandler.logItem(roomid);
        if(data.userid){
          const {balance, userid} = data;
          await io.to(roomid).emit("updated_balance", {balance, userid});
        }
      }

      if (current_round <= 0) {
        console.log("game over")
        io.in(roomid).disconnectSockets();
        io.socketsLeave(roomid);
        
      } else {

        var parsed_item_data = new_item;
        if (current_round != rounds) { //here we say: if we aren't on the first round
          new_item = await redisRoomHandler.setItem(roomid);
          parsed_item_data = JSON.parse(new_item).item_data
        }

        const { name, value, bid, range, description, audio_url, img_url, bidder_id, category, rarity } = parsed_item_data;

        const item = {
          name,
          value, 
          bid, 
          description, 
          audio_url, 
          img_url, 
          category: category, 
          rarity: rarity
        };

        await itemBid(roomid, item, io, sockets, handler, round, secs, start)
        current_round -= 1;

      }

    }
    await round()

  } catch (error) {

  }

}






module.exports = { handleGameLogic }