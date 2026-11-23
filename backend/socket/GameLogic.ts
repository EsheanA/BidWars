import { RoundTiming, currentRoundTiming, withRoundTiming, measureRoundStage } from "../logging/roundTiming";
import { Server, Socket} from "socket.io";
import { type Item } from "../types/Auction";
import type { AuthSocket } from "./types";
import redisRoomHandler from "../RedisRooms/RoomHandler";

interface BidPayload {
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
    handlerFor: (socket: Socket) => (data: unknown) => void,
    round: () => Promise<void>,
    secs: number,
    roundNumber: number
): Promise<void> {
    try {
        const timing = currentRoundTiming();
        if (timing) timing.stage = "presenceRefresh";
        const users = await redisRoomHandler.toggleUsersActiveStatus(roomid);

        io.to(roomid).emit("user list", {
            userlist: users
        });

        io.to(roomid).emit(
            "setItem",
            JSON.stringify({
                item,
                timer: secs,
                timing: {
                    roomId: roomid, round: roundNumber,
                    ...(timing ? { transitionId: timing.transitionId, completedRound: timing.completedRound } : {})
                }
            })
        );

        timing?.complete();

        setTimeout(() => {
            void round();
        }, secs * 1000);

        for (let i = 0; i < sockets.length; i++) {
            const socket = sockets[i];
            if (!socket) continue;
            const handler = handlerFor(socket);
            socket.off("bid", handler);
            socket.on("bid", handler);
        }

    } catch (error) {
        currentRoundTiming()?.fail(error);
        console.error("error with itemBid: ", error);
    }
}

const handleBid = async (
    socket: AuthSocket,
    roomid: string,
    payload: unknown,
    io: Server
): Promise<void> => {
    try {
        const userid = socket.data.userid;
        if (!userid || socket.data.roomid !== roomid || !socket.rooms.has(roomid) ||
            !payload || typeof payload !== "object" || !("bid" in payload)) return;
        const { bid } = payload as BidPayload;
        const data = await redisRoomHandler.handleBid(userid, bid, roomid) as {userid: string, bid: number, roomid: string};

        if (data.userid === userid && data.roomid === roomid) {
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

        const handlers = new Map<Socket, (data: unknown) => void>();
        const handlerFor = (socket: Socket) => {
            let handler = handlers.get(socket);
            if (!handler) {
                handler = (payload: unknown) => { void handleBid(socket as AuthSocket, roomid, payload, io); };
                handlers.set(socket, handler);
            }
            return handler;
        };

        io.to(roomid).emit("begin_game", {
            balance: max_balance,
            bidOptions: bid_options
        });

        let current_round: number = rounds;

        await redisRoomHandler.startGame(roomid);

        const round = async (): Promise<void> => {
            const completedRound = rounds - current_round;
            const timing = completedRound > 0
                ? new RoundTiming(roomid, completedRound, current_round > 0 ? completedRound + 1 : null)
                : undefined;
            await withRoundTiming(timing, async () => {
                try {
                    const sockets: Socket[] = Array.from(io.sockets.sockets.values()).filter(socket => socket.rooms.has(roomid));

                    console.log("Round: ", current_round);


                    if (current_round !== rounds && current_round >= 0) {
                        const data = await measureRoundStage("settlement", async () => {
                            await redisRoomHandler.distributeItemDB(roomid);
                            return redisRoomHandler.logItem(roomid);
                        });
                        if (timing) timing.hadWinner = Boolean(data.userid);

                        if (data.userid) {
                            const { balance, userid } = data;

                            io.to(roomid).emit("updated_balance", {
                                balance,
                                userid
                            });
                        }
                    }

                    if (current_round <= 0) {
                        timing?.complete();
                        setTimeout(() => {
                            console.log("game over");
                            io.in(roomid).disconnectSockets();
                        }, 6 * 1000);

                    } else {

                        if (current_round !== rounds) {
                            if (timing) timing.stage = "itemPreparation";
                            new_item = await redisRoomHandler.setItem(roomid) as Item;
                        }


                        await itemBid(
                            roomid,
                            new_item,
                            io,
                            sockets,
                            handlerFor,
                            round,
                            secs,
                            completedRound + 1
                        );

                        current_round -= 1;
                    }

                } catch (error) {
                    timing?.fail(error);
                    console.error("Round error: ", error);
                }
            });
        };

        await round();

    } catch (error) {
        console.error("Game logic error: ", error);
    }
}

export { handleGameLogic };