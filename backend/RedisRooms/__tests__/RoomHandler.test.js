// backend/RedisRooms/__tests__/RoomHandler.test.js
/**
 * Jest tests for redisRoomHandler singleton.
 * - Mocks: redis client, Room class, callGrok, auctionz.json
 * - Some tests will FAIL because they expose real bugs in RoomHandler.js.
 *   Look for lines marked with `// BUG:` and fix the implementation accordingly.
 */

//start uncommenting from here

// jest.mock("redis", () => {
//     // In-memory fake Redis with minimal features used by RoomHandler
//     const listeners = {};
//     const store = new Map(); // string kv
//     const lists = new Map(); // list key -> array (we treat array end as LPUSH head)
  
//     const client = {
//       on: (event, cb) => {
//         listeners[event] = listeners[event] || [];
//         listeners[event].push(cb);
//       },
//       connect: async () => {
//         if (listeners.connect) {
//           for (const cb of listeners.connect) {
//             await cb();
//           }
//         }
//       },
//       get: async (key) => (store.has(key) ? store.get(key) : null),
//       set: async (key, value) => {
//         store.set(key, value);
//         return "OK";
//       },
//       del: async (keys) => {
//         if (Array.isArray(keys)) {
//           let c = 0;
//           for (const k of keys) if (store.delete(k)) c++;
//           return c;
//         }
//         return store.delete(keys) ? 1 : 0;
//       },
//       lPush: async (key, value) => {
//         const arr = lists.get(key) || [];
//         arr.push(value); // emulate LPUSH head at array end to pair with lPop() as pop()
//         lists.set(key, arr);
//         return arr.length;
//       },
//       lPop: async (key) => {
//         const arr = lists.get(key) || [];
//         const val = arr.pop() ?? null;
//         lists.set(key, arr);
//         return val;
//       },
//       flushDb: async () => {
//         store.clear();
//         lists.clear();
//         return "OK";
//       },
//     };
  
//     return {
//       createClient: () => client,
//       __mock: { client, store, lists, listeners },
//     };
//   });
  
//   let nextRoomId = 1;
//   jest.mock("../Room.js", () => {
//     return jest.fn().mockImplementation((auctionName, auctionIndex) => ({
//       id: `room-${nextRoomId++}`,
//       users: [],
//       in_progress: false,
//       max: false,
//       limit: 2,
//       items: [],
//       itemData: null,
//       auctionIndex,
//       auctionName,
//       rounds: 5,
//     }));
//   });
  
//   jest.mock("../../itemGeneration/grok.js", () => ({
//     callGrok: jest.fn().mockImplementation((auctionIndex) => ({
//       item: {
//         item_name: `Item_${auctionIndex}`,
//         item_value: 120,
//         starting_bid: 10,
//         item_guessing_range: [80, 160],
//         item_description: "Test description",
//       },
//       category: "Test Category",
//     })),
//   }));
  
//   jest.mock("../../auctions/auctionz.json", () => ({
//     auctions: {
//       mainline_auctions: [
//         { name: "Alpha Auction", value_range: [200, 500] },
//         { name: "Beta Auction", value_range: [300, 900] },
//       ],
//     },
//   }));
  
//   // Import after mocks
//   const redis = require("redis");
//   const redisRoomHandler = require("../RoomHandler");
  
//   describe("RoomHandler (singleton) with mocked Redis", () => {
//     beforeEach(async () => {
//       // triggers on('connect') -> flushDb
//       await redisRoomHandler.initClient();
//     });
  
//     test("initClient() connects and flushes DB on connect", async () => {
//       await expect(redisRoomHandler.initClient()).resolves.toBeUndefined();
//     });
  
//     test("findRoom() creates a new room when queue empty, assigns user and balance", async () => {
//       const userid = "u1";
//       const username = "alice";
//       const auctionIndex = 0;
  
//       const roomId = await redisRoomHandler.findRoom(userid, username, auctionIndex);
//       expect(roomId).toMatch(/^room-\d+$/);
  
//       const userObj = JSON.parse(await redis.__mock.client.get(`user:${userid}`));
//       expect(userObj).toMatchObject({
//         roomid: roomId,
//         username,
//         active: true,
//         balance: 250,
//       });
  
//       const roomObj = JSON.parse(await redis.__mock.client.get(`room:${roomId}`));
//       expect(roomObj.users).toEqual([{ userid, username, active: true }]);
//       expect(roomObj.in_progress).toBe(false);
//       expect(roomObj.auctionIndex).toBe(0);
//     });
  
//     test("findRoom() reuses open room and marks max when limit reached", async () => {
//       const auctionIndex = 1;
//       const r1 = await redisRoomHandler.findRoom("uA", "A", auctionIndex);
//       const r2 = await redisRoomHandler.findRoom("uB", "B", auctionIndex);
//       expect(r1).toBe(r2);
  
//       const roomObj = JSON.parse(await redis.__mock.client.get(`room:${r1}`));
//       expect(roomObj.users.length).toBe(2);
//       expect(roomObj.max).toBe(true);
//     });
  
//     test("getUsers() returns user list", async () => {
//       const roomId = await redisRoomHandler.findRoom("u2", "bob", 0);
//       const users = await redisRoomHandler.getUsers(roomId);
//       expect(users).toEqual([{ userid: "u2", username: "bob", active: true }]);
//     });
  
//     test("userExist() resolves true/false appropriately", async () => {
//       await redisRoomHandler.findRoom("u3", "charlie", 0);
//       await expect(redisRoomHandler.userExist("u3")).resolves.toBe(true);
//       await expect(redisRoomHandler.userExist("nope")).resolves.toBe(false);
//     });
  
//     test("getUser() returns parsed user object", async () => {
//       const roomId = await redisRoomHandler.findRoom("u4", "dana", 0);
//       const user = await redisRoomHandler.getUser("u4");
//       expect(user).toEqual({
//         roomid: roomId,
//         username: "dana",
//         active: true,
//         balance: 250,
//       });
//     });
  
//     test("checkWhetherFull() reflects room.max", async () => {
//       const auctionIndex = 0;
//       const r = await redisRoomHandler.findRoom("u5", "eve", auctionIndex);
//       expect(await redisRoomHandler.checkWhetherFull(r)).toBe(false);
//       await redisRoomHandler.findRoom("u6", "frank", auctionIndex); // fills room (limit 2)
//       expect(await redisRoomHandler.checkWhetherFull(r)).toBe(true);
//     });
  
//     test("kickUser() removes user from room and deletes user key", async () => {
//       const roomId = await redisRoomHandler.findRoom("u7", "gina", 0);
  
//       // add a second user to same room
//       const reused = await redisRoomHandler.findRoom("u8", "hank", 0);
//       expect(reused).toBe(roomId);
  
//       await expect(redisRoomHandler.kickUser("u7")).resolves.toBeUndefined();
  
//       const userKey = await redis.__mock.client.get("user:u7");
//       expect(userKey).toBeNull();
  
//       const roomObj = JSON.parse(await redis.__mock.client.get(`room:${roomId}`));
//       expect(roomObj.users).toEqual([{ userid: "u8", username: "hank", active: true }]);
//     });
  
//     test("toggleUserActiveStatus() flips user.active and mirrors to room", async () => {
//       const roomId = await redisRoomHandler.findRoom("u9", "ivy", 0);
  
//       // First toggle: active -> false
//       await expect(redisRoomHandler.toggleUserActiveStatus("u9")).resolves.toBeUndefined();
  
//       const user1 = JSON.parse(await redis.__mock.client.get("user:u9"));
//       expect(user1.active).toBe(false);
  
//       const roomAfterFirst = JSON.parse(await redis.__mock.client.get(`room:${user1.roomid}`));
//       // BUG: implementation uses `if (u.userid == parsedUser.userid)` but parsedUser has no `userid`.
//       // Also flips arr[index].active = !arr[index].active even though we set user to inactive.
//       // Expected: room user active should now be false.
//       // This assertion will likely FAIL until you fix the bug in toggleUserActiveStatus().
//       expect(roomAfterFirst.users[0].active).toBe(false); // BUG: currently fails
  
//       // Second toggle: false -> true
//       await expect(redisRoomHandler.toggleUserActiveStatus("u9")).resolves.toBeUndefined();
//       const user2 = JSON.parse(await redis.__mock.client.get("user:u9"));
//       expect(user2.active).toBe(true);
  
//       const roomAfterSecond = JSON.parse(await redis.__mock.client.get(`room:${user2.roomid}`));
//       // Expected: room user active should now be true again.
//       expect(roomAfterSecond.users[0].active).toBe(true); // BUG: currently may fail
//     });
  
//     test("getUserActiveStatus() returns boolean", async () => {
//       await redisRoomHandler.findRoom("u10", "jake", 0);
//       await expect(redisRoomHandler.getUserActiveStatus("u10")).resolves.toBe(true);
//       await redisRoomHandler.toggleUserActiveStatus("u10");
//       await expect(redisRoomHandler.getUserActiveStatus("u10")).resolves.toBe(false);
//     });
  
//     test("handleBid() updates current item's bid and bidder only if balance >= bid", async () => {
//       // set up a room and pre-populate an itemData
//       const roomId = await redisRoomHandler.findRoom("u11", "kate", 0);
  
//       const roomObj = JSON.parse(await redis.__mock.client.get(`room:${roomId}`));
//       roomObj.itemData = { name: "Foo", value: 100, bid: 0, bidder_id: null };
//       await redis.__mock.client.set(`room:${roomId}`, JSON.stringify(roomObj));
  
//       // Good bid (<= balance 250)
//       const ok = await redisRoomHandler.handleBid(roomId, "u11", 50);
//       expect(ok).toEqual({ userid: "u11", bid: 50 });
  
//       const roomAfter = JSON.parse(await redis.__mock.client.get(`room:${roomId}`));
//       // BUG: implementation calls `await redis.client.set(...)` but no `redis` var exists in file -> ReferenceError at runtime.
//       // Once fixed to `this.client.set(...)`, below expectations should pass:
//       expect(roomAfter.itemData.bid).toBe(50); // BUG: will fail until fix
//       expect(roomAfter.itemData.bidder_id).toBe("u11"); // BUG: will fail until fix
  
//       // Bad bid (exceeds balance)
//       const bad = await redisRoomHandler.handleBid(roomId, "u11", 999);
//       expect(bad).toEqual({ userid: null, bid: 999 });
  
//       const roomAfterBad = JSON.parse(await redis.__mock.client.get(`room:${roomId}`));
//       expect(roomAfterBad.itemData.bid).toBe(50); // unchanged
//       expect(roomAfterBad.itemData.bidder_id).toBe("u11"); // unchanged
//     });
  
//     test("awardItem() moves current item to room.items and deducts from user balance", async () => {
//       const roomId = await redisRoomHandler.findRoom("u12", "leo", 0);
  
//       // seed current item + bidder
//       const roomObj = JSON.parse(await redis.__mock.client.get(`room:${roomId}`));
//       roomObj.itemData = { name: "Bar", value: 200, bid: 60, bidder_id: "u12" };
//       await redis.__mock.client.set(`room:${roomId}`, JSON.stringify(roomObj));
  
//       const beforeUser = JSON.parse(await redis.__mock.client.get("user:u12"));
//       expect(beforeUser.balance).toBe(250);
  
//       const result = await redisRoomHandler.awardItem(roomId);
//       // BUG: returns `{newBalance, userid: user.userid}` but `user` is a string; should be parsedUser.userid or just `userid`.
//       // Expect: { newBalance: 190, userid: "u12" }
//       expect(result).toEqual({ newBalance: 190, userid: "u12" }); // BUG: will fail
  
//       const afterUser = JSON.parse(await redis.__mock.client.get("user:u12"));
//       expect(afterUser.balance).toBe(190);
  
//       const afterRoom = JSON.parse(await redis.__mock.client.get(`room:${roomId}`));
//       expect(afterRoom.items).toEqual([{ name: "Bar", value: 200, bid: 60, bidder_id: null }]); // bidder cleared when moved
//       expect(afterRoom.itemData.bidder_id).toBeNull();
//     });
  
//     test("getPreGameData() populates itemData and returns pregame payload", async () => {
//       const roomId = await redisRoomHandler.findRoom("u13", "maya", 1);
  
//       const payload = await redisRoomHandler.getPreGameData(roomId);
  
//       // payload should contain rounds, item_data, category, max_balance
//       expect(payload.rounds).toBe(5);
//       expect(payload.category).toBe("Test Category");
//       expect(payload.max_balance).toBe(900); // from auctions[1].value_range[1]
  
//       // But implementation uses `const {item, category} = callGrok(parsedRoom.auctionIndex)`
//       // then mistakenly writes `room.itemData = {...}` using `room` (string!) not `parsedRoom`.
//       // This means Redis may not receive updated itemData. Verify stored room:
//       const stored = JSON.parse(await redis.__mock.client.get(`room:${roomId}`));
//       // Expected: itemData is set on parsedRoom.
//       expect(stored.itemData).toMatchObject({
//         name: "Item_1",
//         value: 120,
//         bid: 10,
//         range: [80, 160],
//         description: "Test description",
//         url: expect.stringContaining("/audioFiles/Item_1.svg"),
//       }); // BUG: will fail until fix
//     });
  
//     test("checkGameStarted() returns boolean; startGame() flips in_progress and persists", async () => {
//       const roomId = await redisRoomHandler.findRoom("u14", "nora", 0);
//       await expect(redisRoomHandler.checkGameStarted(roomId)).resolves.toBe(false);
  
//       await expect(redisRoomHandler.startGame(roomId)).resolves.toBeUndefined();
  
//       // BUG: startGame sets parsedRoom.in_progress = true but never writes back with this.client.set(...)
//       // So checkGameStarted should still be false until you persist the change.
//       const started = await redisRoomHandler.checkGameStarted(roomId);
//       expect(started).toBe(true); // BUG: will fail until you persist in startGame()
//     });
  
//     test("setUsersToActive() sets all room users + user keys to active and persists", async () => {
//       const roomId = await redisRoomHandler.findRoom("u15", "olga", 0);
//       await redisRoomHandler.findRoom("u16", "paul", 0); // same room, fills up
  
//       // flip one user to inactive to see it toggle back
//       await redisRoomHandler.toggleUserActiveStatus("u15");
  
//       // Now call setUsersToActive
//       await expect(redisRoomHandler.setUsersToActive(roomId)).resolves.toBeUndefined();
  
//       // Implementation bugs:
//       // - uses this.client.get(roomid) instead of `room:${roomid}`
//       // - writes user objects without JSON.stringify
//       // - writes room via `parsedUser.roomid` which is undefined
//       // The following expectations describe desired behavior; they will FAIL until fixed.
  
//       const roomObj = JSON.parse(await redis.__mock.client.get(`room:${roomId}`));
//       roomObj.users.forEach((u) => expect(u.active).toBe(true)); // BUG: will fail
  
//       const u15 = JSON.parse(await redis.__mock.client.get("user:u15"));
//       const u16 = JSON.parse(await redis.__mock.client.get("user:u16"));
//       expect(u15.active).toBe(true); // BUG: may fail (stringify issue)
//       expect(u16.active).toBe(true); // BUG: may fail (stringify issue)
//     });
//   });