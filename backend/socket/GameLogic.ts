import { Server, Socket} from "socket.io";
import { type Item } from "../types/Auction";
import redisRoomHandler from "../RedisRooms/RoomHandler";

interface BidPayload {
    userid: string;
    bid: number;
}

interface PreGameData {
    rounds: number;
    max_balance: number;
    item_data: Item;
    bid_options: number[];
}

async function itemBid(
    roomid: string,
    item: Item,
    io: Server,
    sockets: Socket[],
    handler: (data: BidPayload) => void,
    round: () => Promise<void>,
    secs: number
): Promise<void> {
    try {
        const users = await redisRoomHandler.toggleUsersActiveStatus(roomid);

        io.to(roomid).emit("user list", {
            userlist: users
        });

        io.to(roomid).emit(
            "setItem",
            JSON.stringify({
                item,
                timer: secs
            })
        );

        setTimeout(() => {
            void round();
        }, secs * 1000);

        for (let i = 0; i < sockets.length; i++) {
            sockets[i]?.off("bid", handler);
            sockets[i]?.on("bid", handler);
        }

    } catch (error) {
        console.error("error with itemBid: ", error);
    }
}

const handleBid = async (
    userid: string,
    bid: number,
    io: Server
): Promise<void> => {
    try {
        const data = await redisRoomHandler.handleBid(userid, bid) as {userid: string, bid: number, roomid: string};

        if (data.userid !== "") {
            io.to(data.roomid).emit("current bid", {
                bidder_id: data.userid,
                bid,
                bid_message: `I bid $${bid}, skibidi`
            });
        }

    } catch (error) {
        console.error(error);
    }
};

async function handleGameLogic(
    io: Server,
    roomid: string
): Promise<void> {
    try {
        const pregame_data =
            await redisRoomHandler.getPreGameData(roomid);

        const {
            rounds,
            max_balance,
            item_data,
            bid_options
        } = JSON.parse(pregame_data) as PreGameData;

        let new_item: Item = item_data;

        const secs: number = 20;

        const handler = ({ userid, bid }: BidPayload): void => {
            void handleBid(userid, bid, io);
        };

        io.to(roomid).emit("begin_game", {
            balance: max_balance,
            bidOptions: bid_options
        });

        let current_round: number = rounds;

        await redisRoomHandler.startGame(roomid);

        const round = async (): Promise<void> => {
            try {
                const sockets: Socket[] = Array.from(io.sockets.sockets.values()).filter(socket => socket.rooms.has(roomid));

                console.log("Round: ", current_round);


                if (current_round !== rounds && current_round >= 0) {
                    await redisRoomHandler.distributeItemDB(roomid);

                    const data =
                        await redisRoomHandler.logItem(roomid);

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

                } else {

                    if (current_round !== rounds) {
                        new_item = await redisRoomHandler.setItem(roomid) as Item;
                    }


                    await itemBid(
                        roomid,
                        new_item,
                        io,
                        sockets,
                        handler,
                        round,
                        secs
                    );

                    current_round -= 1;
                }

            } catch (error) {
                console.error("Round error: ", error);
            }
        };

        await round();

    } catch (error) {
        console.error("Game logic error: ", error);
    }
}

export { handleGameLogic };