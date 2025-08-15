const redisRoomHandler = require("../RedisRooms/RoomHandler");

async function handleGameLogic(io, roomid) {
    try{
    //   var items = room.items_for_bid
    //   var newitems = []
    //   items.forEach((i, index, array) => {
    //     // Modify the element at the current index within the original array
    //     newitems.push(i.name + "_"+ i.starting_bid)
    //   });
    //   console.log(newitems)
    //   await createVoicelines(newitems)
    const {rounds, maxBalance, item} = await redisRoomHandler.getPreGameData(roomid);
    const currentItem = item
    const secs = 18;
    // const rounds = pregame_data.rounds;
    if (!room.private) {
    const handler = ({ user, bid }) => {
        bidHandle(user, bid, roomid);
    };

    io.to(room.id).emit("begin_game", { balance: maxBalance, bidOptions: room.bidOptions })
    const users = await redisRoomHandler.getUsers(roomid)

    console.log("game begin")
    await redisRoomHandler.startGame(roomid)

    let round = async () => {

            const sockets = await io.in(room.id).fetchSockets()

            //assign won item to top bidder
            if (item_index > 0) {
                let data = await redisclient.get(JSON.stringify(room.id))
            data = JSON.parse(data)
            if (data.highestbid_data) {
                const { user, bid } = data.highestbid_data;

                if (user) {
                let originalBal = data[JSON.stringify(user.userid)];
                data[JSON.stringify(user.userid)] = originalBal - bid;
                
                data.postgame.push({ user, item: data.currentItem, bid })

                room.postgame.push({ user, item: data.currentItem, bid })
                io.to(room.id).emit("updated_balance", { userid: user.userid, balance: data[JSON.stringify(user.userid)] })
                data.highestbid_data = null;


                updateRedisData(room.id, data)
                }
            
            
            }
        }

        if (item_index >= room.items_for_bid.length) {

            let data = await redisclient.get(JSON.stringify(room.id));
            if(data){
                data = JSON.parse(data);
                console.log(data.postgame)
                distributeItems(data.postgame)
            }
    
            room.game_over = true;
            io.in(room.id).disconnectSockets();
            io.in(room.id).socketsLeave(room.id);
            console.log("game over")
            await redisclient.del(JSON.stringify(room.id))
        }
        else {
            let item = room.items_for_bid[item_index]
            
            let roomdata = await redisclient.get(JSON.stringify(room.id))

            roomdata = JSON.parse(roomdata);
            roomdata.currentItem = item;
            updateRedisData(room.id, roomdata)

            room.highestbidder = { user: null, bid: item.starting_bid }
            io.to(room.id).emit("current bid", { highestBidder: room.highestbidder, bidmessage: "" });
            itemBid(room, item, sockets, handler, secs)

        }
    };
    round()
    const interval = setInterval(round, secs * 1000)
    setTimeout(() => {
        clearInterval(interval);
    }, secs * 1000 * rounds + 20);
  
    }
    }catch(error){

    }
  }
  
  function itemBid(room, item, sockets, handler, secs) {
    room.setUserActiveStatus(true, 0, true);
    io.to(room.id).emit('user list', { userlist: room.users })
  
    io.to(room.id).emit("setItem", { item, timer: secs-3 })
    for (let i = 0; i < sockets.length; i++) {
      sockets[i].off("bid", handler)
      sockets[i].on("bid", handler)
    }
  }
  
  
  
  const bidHandle = async (user, balance, bid, room) => {
    if (!(bid > balance) && (!room.highestbidder.user || user.userid != room.highestbidder.user.userid)) {
      if (room.getUserActiveStatus(user.userid)) {
        let data = await redisclient.get(JSON.stringify(room.id));
        data = JSON.parse(data);
        data.highestbid_data = { bid, user };
        updateRedisData(room.id, data)
        room.highestbidder.user = user;
        room.highestbidder.bid = bid;
        io.to(room.id).emit("current bid", { highestBidder: room.highestbidder, bidmessage: `I bid $${bid}, skibidi` });
      }
    }
  }