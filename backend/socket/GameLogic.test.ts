import { describe, it, expect, vi, beforeEach } from 'vitest';
import { room, item, user, socket, socketServer } from '../test-support/fixtures';
vi.mock('../RedisRooms/RoomHandler', () => ({ default: {
        initClient: vi.fn(), getPreGameData: vi.fn(), startGame: vi.fn(), toggleUsersActiveStatus: vi.fn(), handleBid: vi.fn(), distributeItemDB: vi.fn(), logItem: vi.fn(), setItem: vi.fn(), getUser: vi.fn(), toggleSingleUserActiveStatus: vi.fn(), findRoom: vi.fn(), getUsers: vi.fn(), checkWhetherFull: vi.fn(), checkGameStarted: vi.fn(), kickUser: vi.fn(), deleteRoom: vi.fn(), userExist: vi.fn()
    } }));
import handler from '../RedisRooms/RoomHandler';
const h = vi.mocked(handler);
import { handleGameLogic } from './GameLogic';
let f: ReturnType<typeof socketServer>;
beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    f = socketServer();
    h.getPreGameData.mockResolvedValue(JSON.stringify({
        rounds: 3, max_balance: 250, item_data: item, bid_options: [5, 10, 20]
    }));
    h.startGame.mockResolvedValue();
    h.toggleUsersActiveStatus.mockResolvedValue(room().users);
    h.setItem.mockResolvedValue({ ...item, name: 'Next' });
    h.logItem.mockResolvedValue({ userid: 'alice', balance: 225 });
    h.distributeItemDB.mockResolvedValue();
    h.handleBid.mockResolvedValue({ userid: 'alice', roomid: 'r1', bid: 50 });
});
const start = () => handleGameLogic(f.io as any, 'r1');
const tick = () => vi.advanceTimersByTimeAsync(20000);
const events = (name: string) => f.io.events.filter(e => e.event === name);
describe("handleGameLogic", () => {
    describe("game and round progression", () => {
        it("should announce the initial balance and bid options to the selected room", async () => {
            await start();
            expect(events('begin_game')).toEqual([{ room: 'r1', event: 'begin_game', data: { balance: 250, bidOptions: [5, 10, 20] } }]);
        });
        it("should mark the game started before opening its first bidding round", async () => {
            await start();
            expect(h.startGame.mock.invocationCallOrder[0]).toBeLessThan(h.toggleUsersActiveStatus.mock.invocationCallOrder[0]!);
        });
        it("should publish the active player list and current item with a twenty-second round timer", async () => {
            await start();
            expect(events('user list')[0]!.data).toEqual({ userlist: room().users });
            expect(JSON.parse(events('setItem')[0]!.data)).toEqual({ item, timer: 20 });
        });
        it("should reuse the prepared item for the first round and generate a new item for each later round", async () => {
            await start();
            expect(h.setItem).not.toHaveBeenCalled();
            await tick();
            expect(JSON.parse(events('setItem')[1]!.data).item.name).toBe('Next');
            expect(h.setItem).toHaveBeenCalledOnce();
        });
        it("should leave the current round open until its timer expires", async () => {
            await start();
            await vi.advanceTimersByTimeAsync(19999);
            expect(h.logItem).not.toHaveBeenCalled();
            expect(events('setItem')).toHaveLength(1);
        });
        it("should settle each completed round including the final round before moving on", async () => {
            await start();
            await tick();
            await tick();
            await tick();
            expect(h.distributeItemDB).toHaveBeenCalledTimes(3);
            expect(h.logItem).toHaveBeenCalledTimes(3);
            expect(h.distributeItemDB.mock.invocationCallOrder[0]).toBeLessThan(h.logItem.mock.invocationCallOrder[0]!);
        });
        it("should broadcast the winner's updated balance after settlement", async () => {
            await start();
            await tick();
            expect(events('updated_balance')[0]).toEqual({ room: 'r1', event: 'updated_balance', data: { userid: 'alice', balance: 225 } });
        });
        it("should omit a balance broadcast when settlement returns no winning player", async () => {
            h.logItem.mockResolvedValue({ userid: null, balance: null });
            await start();
            await tick();
            expect(events('updated_balance')).toEqual([]);
        });
        it("should finish after the configured number of rounds without generating an extra item", async () => {
            await start();
            await tick();
            await tick();
            await tick();
            expect(events('setItem')).toHaveLength(3);
            expect(h.setItem).toHaveBeenCalledTimes(2);
        });
        it("should disconnect only that room's sockets after the six-second game-over delay", async () => {
            await start();
            await tick();
            await tick();
            await tick();
            await vi.advanceTimersByTimeAsync(5999);
            expect(f.disconnected).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(f.io.in).toHaveBeenCalledWith('r1');
            expect(f.disconnected).toHaveBeenCalledOnce();
        });
    });
    describe("bid events", () => {
        it("should broadcast accepted bids only to the room returned by the auction service", async () => {
            await start();
            await f.s.handlers.get('bid')!({ userid: 'alice', bid: 50 });
            await Promise.resolve();
            expect(events('current bid')[0]).toMatchObject({ room: 'r1', data: { bidder_id: 'alice', bid: 50 } });
        });
        it("should avoid broadcasting rejected bids or bids whose handling fails", async () => {
            await start();
            h.handleBid.mockResolvedValueOnce({ userid: '', roomid: '', bid: 50 });
            f.s.handlers.get('bid')!({ userid: 'alice', bid: 50 });
            await vi.advanceTimersByTimeAsync(0);
            h.handleBid.mockRejectedValueOnce(new Error('offline'));
            f.s.handlers.get('bid')!({ userid: 'alice', bid: 50 });
            await vi.advanceTimersByTimeAsync(0);
            expect(events('current bid')).toEqual([]);
        });
        it("should ignore sockets outside the current game room when registering bidding handlers", async () => {
            await start();
            expect(f.other.handlers.has('bid')).toBe(false);
            expect(f.s.handlers.has('bid')).toBe(true);
        });
        it("should process one bid only once after advancing through multiple rounds", async () => {
            await start();
            await tick();
            await tick();
            f.s.handlers.get('bid')!({ userid: 'alice', bid: 50 });
            await vi.advanceTimersByTimeAsync(0);
            expect(h.handleBid).toHaveBeenCalledOnce();
        });
    });
    describe("dependency failures", () => {
        it("should avoid opening a round when pregame data cannot be loaded or parsed", async () => {
            for (const invalid of ['failure', 'json']) {
                h.getPreGameData.mockImplementationOnce(async () => {
                    if (invalid === 'failure')
                        throw new Error('offline');
                    return 'bad json';
                });
                await start();
            }
            expect(events('setItem')).toEqual([]);
            expect(vi.getTimerCount()).toBe(0);
        });
        it("should stop round progression when game startup or item preparation fails", async () => {
            h.startGame.mockRejectedValueOnce(new Error('offline'));
            await start();
            expect(events('setItem')).toHaveLength(0);
            await start();
            h.setItem.mockRejectedValueOnce(new Error('generation'));
            await tick();
            expect(events('setItem')).toHaveLength(1);
            expect(vi.getTimerCount()).toBe(0);
        });
        it("should stop advancing the round when settlement rejects", async () => {
            await start();
            h.logItem.mockRejectedValueOnce(new Error('offline'));
            await tick();
            expect(events('setItem')).toHaveLength(1);
            expect(vi.getTimerCount()).toBe(0);
        });
        it("should handle failed player-status refreshes without an unhandled rejection", async () => {
            h.toggleUsersActiveStatus.mockRejectedValueOnce(new Error('offline'));
            await expect(start()).resolves.toBeUndefined();
            expect(events('setItem')).toEqual([]);
            expect(vi.getTimerCount()).toBe(0);
        });
    });
    describe("Proposed safeguards requiring approval: D3, D5, D9 in TEST_OUTLINES.md", () => {
        it.todo("should derive the bidding player from the authenticated socket instead of trusting a submitted user ID");
        it.todo("should reject a bid submitted through a socket outside the player's current room");
        it.todo("should stop accepting bids while a round is settling and after the final round ends");
        it.todo("should prevent a bid already in progress from changing an item after its round closes");
        it.todo("should let a player who reconnects during a round receive updates and bid in that round");
        it.todo("should cancel remaining round timers and bid handlers when a game is aborted or its room is removed");
    });
});
