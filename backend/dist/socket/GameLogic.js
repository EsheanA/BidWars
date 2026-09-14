"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGameLogic = handleGameLogic;
const RoomHandler_1 = __importDefault(require("../RedisRooms/RoomHandler"));
async function itemBid(roomid, item, io, sockets, handler, round, secs, start) {
    try {
        const users = await RoomHandler_1.default.toggleUsersActiveStatus(roomid);
        io.to(roomid).emit("user list", {
            userlist: users
        });
        io.to(roomid).emit("setItem", JSON.stringify({
            item,
            timer: secs
        }));
        setTimeout(() => {
            void round();
        }, secs * 1000);
        for (let i = 0; i < sockets.length; i++) {
            sockets[i]?.off("bid", handler);
            sockets[i]?.on("bid", handler);
        }
    }
    catch (error) {
        console.error("error with itemBid: ", error);
    }
}
const handleBid = async (userid, bid, io) => {
    try {
        const data = await RoomHandler_1.default.handleBid(userid, bid);
        if (data.userid !== "") {
            io.to(data.roomid).emit("current bid", {
                bidder_id: data.userid,
                bid,
                bid_message: `I bid $${bid}, skibidi`
            });
        }
    }
    catch (error) {
        console.error(error);
    }
};
async function handleGameLogic(io, roomid) {
    try {
        const pregame_data = await RoomHandler_1.default.getPreGameData(roomid);
        const { rounds, max_balance, item_data, bid_options } = JSON.parse(pregame_data);
        let new_item = item_data;
        const secs = 20;
        const handler = ({ userid, bid }) => {
            void handleBid(userid, bid, io);
        };
        io.to(roomid).emit("begin_game", {
            balance: max_balance,
            bidOptions: bid_options
        });
        let current_round = rounds;
        await RoomHandler_1.default.startGame(roomid);
        const round = async () => {
            try {
                const sockets = Array.from(io.sockets.sockets.values()).filter(socket => socket.rooms.has(roomid));
                console.log("Round: ", current_round);
                const start = Date.now();
                if (current_round !== rounds && current_round >= 0) {
                    await RoomHandler_1.default.distributeItemDB(roomid);
                    const data = await RoomHandler_1.default.logItem(roomid);
                    if (data.userid) {
                        const { balance, userid } = data;
                        io.to(roomid).emit("updated_balance", {
                            balance,
                            userid
                        });
                    }
                }
                if (current_round <= 0) {
                    setTimeout(() => {
                        console.log("game over");
                        io.in(roomid).disconnectSockets();
                    }, 6 * 1000);
                }
                else {
                    if (current_round !== rounds) {
                        new_item = await RoomHandler_1.default.setItem(roomid);
                    }
                    await itemBid(roomid, new_item, io, sockets, handler, round, secs, start);
                    current_round -= 1;
                }
            }
            catch (error) {
                console.error("Round error: ", error);
            }
        };
        await round();
    }
    catch (error) {
        console.error("Game logic error: ", error);
    }
}
//# sourceMappingURL=GameLogic.js.map