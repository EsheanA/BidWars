import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import crypto from "node:crypto";
import auctionData from "../auctions/auctionz.json";
import ItemModel from "../models/Item";
import UserModel from "../models/User";
import { RoomRepository } from "../repositories/roomRepository";
import { RoomService } from "../services/roomService";
import { AuctionService } from "../services/auctionService";
import { RewardService } from "../services/rewardService";
import type { GrokItemResponse } from "../types/Auction";

const generatedItem: GrokItemResponse = {
    item: {
        item_name: "Vintage Watch",
        item_value: 150,
        starting_bid: 25,
        item_guessing_range: "100-200",
        item_description: "A vintage watch. Bidding starts at 25 dollars."
    },
    category: "watch",
    audio_url: "audioFiles/watch.mp3",
    img_url: "watch.svg",
    rarity: "Collector’s Find"
};

function setup(t: TestContext) {
    t.mock.method(console, "log", () => {});
    t.mock.method(console, "error", () => {});
    const values = new Map<string, string>();
    const queues = new Map<string, string[]>();
    const client = {
        async get(key: string) { return values.get(key) ?? null; },
        async set(key: string, value: string) { values.set(key, value); },
        async del(key: string) { values.delete(key); },
        async lPop(key: string) { return queues.get(key)?.shift() ?? null; },
        async lPush(key: string, value: string) {
            const queue = queues.get(key) ?? [];
            queue.unshift(value);
            queues.set(key, queue);
        }
    };
    const repository = new RoomRepository(client);
    const rooms = new RoomService(repository);
    const generate = t.mock.fn(async (_auctionIndex: number) => JSON.stringify(generatedItem));
    const auctions = new AuctionService(repository, generate);
    const rewards = new RewardService(repository);
    return { values, queues, client, repository, rooms, auctions, rewards, generate };
}

test("matchmaking joins two players and initializes their room and balances", async (t) => {
    const { values, queues, repository, rooms } = setup(t);
    const auction = auctionData.auctions.mainline_auctions[0]!;
    const roomId = await rooms.findRoom("alice", "Alice", 0);
    assert.equal(await rooms.findRoom("bob", "Bob", 0), roomId);
    assert.equal(await rooms.checkWhetherFull(roomId), true);
    assert.deepEqual(await rooms.getUsers(roomId), [
        { userid: "alice", username: "Alice", active: true },
        { userid: "bob", username: "Bob", active: true }
    ]);
    assert.deepEqual(await rooms.getUser("alice"), {
        roomid: roomId, username: "Alice", active: true,
        balance: auction.value_range[1], items: []
    });
    assert.equal((await repository.getRoom(roomId)).auction, auction.name);
    assert.ok(values.has(`room:${roomId}`));
    assert.ok(values.has("user:bob"));
    assert.deepEqual(queues.get(`rooms:${auction.name}`), [roomId]);
});

for (const unavailable of ["full", "started"] as const) {
    test(`matchmaking creates a new room when the queued room is ${unavailable}`, async (t) => {
        const { repository, rooms, auctions } = setup(t);
        const firstRoomId = await rooms.findRoom("alice", "Alice", 0);
        if (unavailable === "full") {
            await rooms.findRoom("bob", "Bob", 0);
        } else {
            await auctions.startGame(firstRoomId);
        }
        const nextRoomId = await rooms.findRoom("charlie", "Charlie", 0);
        assert.notEqual(nextRoomId, firstRoomId);
        assert.equal((await repository.getUser("charlie")).roomid, nextRoomId);
        assert.deepEqual(await rooms.getUsers(nextRoomId), [
            { userid: "charlie", username: "Charlie", active: true }
        ]);
    });
}

test("disconnecting and reconnecting toggles the stored user's active status", async (t) => {
    const { rooms } = setup(t);
    await rooms.findRoom("alice", "Alice", 0);
    await rooms.toggleSingleUserActiveStatus("alice");
    assert.equal(await rooms.getUserActiveStatus("alice"), false);
    await rooms.toggleSingleUserActiveStatus("alice");
    assert.equal(await rooms.getUserActiveStatus("alice"), true);
});

test("kicking a player respects their room and leaves the other player intact", async (t) => {
    const { repository, rooms } = setup(t);
    const roomId = await rooms.findRoom("alice", "Alice", 0);
    await rooms.findRoom("bob", "Bob", 0);
    await rooms.kickUser("alice", "another-room");
    assert.equal(await rooms.userExist("alice"), true);
    await rooms.kickUser("alice", roomId);
    assert.equal(await rooms.userExist("alice"), false);
    assert.deepEqual(await rooms.getUsers(roomId), [
        { userid: "bob", username: "Bob", active: true }
    ]);
    await rooms.kickUser("bob", roomId);
    await rooms.deleteRoom(roomId);
    assert.equal(await repository.findRoom(roomId), null);
});

test("a new round refreshes the active users from their stored status", async (t) => {
    const { repository, rooms } = setup(t);
    const roomId = await rooms.findRoom("alice", "Alice", 0);
    const room = await repository.getRoom(roomId);
    room.users[0]!.active = false;
    await repository.saveRoom(roomId, room);
    assert.deepEqual(await rooms.toggleUsersActiveStatus(roomId), [
        { userid: "alice", username: "Alice", active: true }
    ]);
});

test("pregame data keeps its existing JSON shape and subsequent rounds replace the item", async (t) => {
    const { repository, rooms, auctions, generate } = setup(t);
    const roomId = await rooms.findRoom("alice", "Alice", 0);
    const data = JSON.parse(await auctions.getPreGameData(roomId));
    assert.deepEqual(data, {
        rounds: 3,
        item_data: {
            name: generatedItem.item.item_name,
            value: 150,
            bid: 25,
            range: "100-200",
            description: generatedItem.item.item_description,
            audio_url: generatedItem.audio_url,
            img_url: generatedItem.img_url,
            bidder_id: "",
            rarity: generatedItem.rarity
        },
        max_balance: 250,
        bid_options: [5, 10, 20]
    });
    assert.equal(await auctions.checkGameStarted(roomId), false);
    await auctions.startGame(roomId);
    assert.equal(await auctions.checkGameStarted(roomId), true);
    await auctions.handleBid("alice", 50);
    assert.deepEqual(await auctions.setItem(roomId), data.item_data);
    assert.deepEqual((await repository.getRoom(roomId)).itemData, data.item_data);
    assert.equal(generate.mock.callCount(), 2);
    assert.deepEqual(generate.mock.calls.map((call) => call.arguments), [[0], [0]]);
});

test("accepted bids update the auction without charging the player before settlement", async (t) => {
    const { repository, rooms, auctions } = setup(t);
    const roomId = await rooms.findRoom("alice", "Alice", 0);
    await auctions.getPreGameData(roomId);
    assert.deepEqual(await auctions.handleBid("alice", 75), {
        userid: "alice", bid: 75, roomid: roomId
    });
    const item = (await repository.getRoom(roomId)).itemData!;
    assert.equal(item.bid, 75);
    assert.equal(item.bidder_id, "alice");
    assert.equal((await rooms.getUser("alice")).balance, 250);
});

for (const rejection of ["insufficient balance", "inactive player"] as const) {
    test(`bids from a player with ${rejection} do not change the auction`, async (t) => {
        const { repository, rooms, auctions } = setup(t);
        const roomId = await rooms.findRoom("alice", "Alice", 0);
        await auctions.getPreGameData(roomId);
        const before = await repository.getRoom(roomId);
        if (rejection === "inactive player") {
            await rooms.toggleSingleUserActiveStatus("alice");
        }
        const bid = rejection === "insufficient balance" ? 251 : 50;
        assert.deepEqual(await auctions.handleBid("alice", bid), {
            userid: "", bid, roomid: ""
        });
        assert.deepEqual((await repository.getRoom(roomId)).itemData, before.itemData);
    });
}

test("settlement creates inventory, charges the winner, and resets the round's bid", async (t) => {
    const { repository, rooms, auctions, rewards } = setup(t);
    const winnerId = "507f1f77bcf86cd799439011";
    const roomId = await rooms.findRoom(winnerId, "Alice", 0);
    await auctions.getPreGameData(roomId);
    await auctions.handleBid(winnerId, 75);
    t.mock.method(ItemModel, "findOne", async () => null);
    let savedItem: InstanceType<typeof ItemModel> | undefined;
    t.mock.method(ItemModel.prototype, "save", async function (this: InstanceType<typeof ItemModel>) {
        savedItem = this;
        return this;
    });
    const charge = t.mock.method(UserModel, "findByIdAndUpdate", async () => null);

    await rewards.distributeItemDB(roomId);
    assert.ok(savedItem);
    assert.equal(savedItem.name, "Vintage Watch");
    assert.equal(savedItem.owner.toString(), winnerId);
    assert.equal(savedItem.amount, 1);
    assert.equal(savedItem.bid, 75);
    assert.equal(savedItem.hashcode, crypto.createHash("sha256").update("Vintage Watch" + winnerId).digest("hex"));
    assert.deepEqual(charge.mock.calls[0]!.arguments, [winnerId, { $inc: { balance: -75 } }]);
    assert.deepEqual(await rewards.logItem(roomId), { balance: 175, userid: winnerId });
    assert.equal((await rooms.getUser(winnerId)).balance, 175);
    const item = (await repository.getRoom(roomId)).itemData!;
    assert.equal(item.bid, 0);
    assert.equal(item.bidder_id, "");
});

test("winning an existing item increments its inventory amount", async (t) => {
    const { rooms, auctions, rewards } = setup(t);
    const roomId = await rooms.findRoom("alice", "Alice", 0);
    await auctions.getPreGameData(roomId);
    await auctions.handleBid("alice", 50);
    t.mock.method(ItemModel, "findOne", async () => ({ amount: 2 }));
    const increment = t.mock.method(ItemModel, "findOneAndUpdate", async () => null);
    const save = t.mock.method(ItemModel.prototype, "save", async () => {
        throw new Error("An existing item must not be inserted again");
    });
    const charge = t.mock.method(UserModel, "findByIdAndUpdate", async () => null);
    await rewards.distributeItemDB(roomId);
    assert.equal(increment.mock.callCount(), 1);
    assert.deepEqual(increment.mock.calls[0]!.arguments[1], { $inc: { amount: 1 } });
    assert.equal(save.mock.callCount(), 0);
    assert.deepEqual(charge.mock.calls[0]!.arguments, ["alice", { $inc: { balance: -50 } }]);
});

test("failed item generation leaves the previous room state intact", async (t) => {
    const { repository, rooms } = setup(t);
    const roomId = await rooms.findRoom("alice", "Alice", 0);
    const before = await repository.getRoom(roomId);
    const failure = new Error("Generator unavailable");
    const auctions = new AuctionService(repository, async () => { throw failure; });
    await assert.rejects(auctions.getPreGameData(roomId), failure);
    await assert.rejects(auctions.setItem(roomId), failure);
    assert.deepEqual(await repository.getRoom(roomId), before);
});

test("missing room and user records retain the existing service failure behavior", async (t) => {
    const { client, rooms, auctions, rewards } = setup(t);
    assert.equal(await rooms.userExist("missing"), false);
    await assert.rejects(rooms.getUser("missing"), /User missing not found/);
    await assert.rejects(rooms.getUsers("missing"), /Room missing not found/);
    await assert.rejects(auctions.startGame("missing"), /Room missing not found/);
    await assert.rejects(rewards.logItem("missing"), /Room missing not found/);
    await assert.doesNotReject(rewards.distributeItemDB("missing"));
    t.mock.method(client, "get", async () => { throw new Error("Redis unavailable"); });
    assert.equal(await rooms.userExist("missing"), false);
});

test("membership checks only require a stored user record", async (t) => {
    const { values, rooms } = setup(t);
    values.set("user:alice", "");
    assert.equal(await rooms.userExist("alice"), true);
});
