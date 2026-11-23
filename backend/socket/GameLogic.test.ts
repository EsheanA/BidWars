import { describe, it, expect, vi, beforeEach } from 'vitest';
import { room, item, user, socket, socketServer } from '../test-support/fixtures';
vi.mock('../RedisRooms/RoomHandler', () => ({ default: {
        initClient: vi.fn(), getPreGameData: vi.fn(), startGame: vi.fn(), toggleUsersActiveStatus: vi.fn(), handleBid: vi.fn(), distributeItemDB: vi.fn(), logItem: vi.fn(), setItem: vi.fn(), getUser: vi.fn(), toggleSingleUserActiveStatus: vi.fn(), findRoom: vi.fn(), getUsers: vi.fn(), checkWhetherFull: vi.fn(), checkGameStarted: vi.fn(), kickUser: vi.fn(), deleteRoom: vi.fn(), userExist: vi.fn()
    } }));
import handler from '../RedisRooms/RoomHandler';
const h = vi.mocked(handler);
import { handleGameLogic } from './GameLogic';
import { AuctionService } from '../services/auctionService';
import { RewardService } from '../services/rewardService';
import { generated, repository } from '../test-support/fixtures';
import ItemModel from '../models/Item';
import UserModel from '../models/User';
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
        it("should publish the active player list and current item with a twenty-second round timer", async () => {
            await start();
            expect(events('user list')[0]!.data).toEqual({ userlist: room().users });
            expect(JSON.parse(events('setItem')[0]!.data)).toEqual({ item, timer: 20, timing: {roomId: 'r1', round: 1} });
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
        it("completes three no-bid rounds using real settlement without awarding or charging", async () => {
            const harness = repository();
            const generate = vi.fn(async () => JSON.stringify(generated));
            const auctions = new AuctionService(harness.dependency, generate);
            const rewards = new RewardService(harness.dependency);
            const inventoryLookup = vi.spyOn(ItemModel, 'findOne').mockRejectedValue(new Error('Unexpected inventory lookup'));
            const charge = vi.spyOn(UserModel, 'findByIdAndUpdate').mockRejectedValue(new Error('Unexpected charge'));
            h.getPreGameData.mockImplementation(auctions.getPreGameData.bind(auctions));
            h.startGame.mockImplementation(auctions.startGame.bind(auctions));
            h.setItem.mockImplementation(auctions.setItem.bind(auctions));
            h.distributeItemDB.mockImplementation(rewards.distributeItemDB.bind(rewards));
            h.logItem.mockImplementation(rewards.logItem.bind(rewards));

            await start();
            await tick();
            expect(events('setItem')).toHaveLength(2);
            await tick();
            await tick();

            expect(events('setItem')).toHaveLength(3);
            expect(generate).toHaveBeenCalledTimes(3);
            const summaries = vi.mocked(console.log).mock.calls
                .map(([line]) => typeof line === 'string' && line.startsWith('{') ? JSON.parse(line) : null)
                .filter(entry => entry?.event === 'round.transition.completed');
            expect(summaries).toHaveLength(2);
            for (const [index, summary] of summaries.entries()) {
                expect(summary).toMatchObject({roomId: 'r1', completedRound: index + 1, nextRound: index + 2, hadWinner: false, status: 'success'});
                expect(JSON.parse(events('setItem')[index + 1]!.data).timing.transitionId).toBe(summary.transitionId);
            }
            expect(events('updated_balance')).toEqual([]);
            expect(harness.users.get('alice')!.balance).toBe(250);
            expect(inventoryLookup).not.toHaveBeenCalled();
            expect(charge).not.toHaveBeenCalled();
            expect(harness.api.getUser).not.toHaveBeenCalled();
            expect(harness.api.saveUser).not.toHaveBeenCalled();
            expect(f.disconnected).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(6000);
            expect(f.disconnected).toHaveBeenCalledOnce();
            expect(vi.getTimerCount()).toBe(0);
            expect(console.error).not.toHaveBeenCalled();
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
});
it('starts the game and announces its initial bidding state before opening the round', async () => {
    await start();
    expect(events('begin_game')).toEqual([{ room: 'r1', event: 'begin_game', data: { balance: 250, bidOptions: [5, 10, 20] } }]);
    expect(h.startGame.mock.invocationCallOrder[0]).toBeLessThan(h.toggleUsersActiveStatus.mock.invocationCallOrder[0]!);
});

it('ignores a forged bidder ID and attributes the bid to the authenticated socket', async () => {
    await start();
    await f.s.handlers.get('bid')!({userid: 'victim', bid: 50});
    await vi.advanceTimersByTimeAsync(0);
    expect(h.handleBid).toHaveBeenCalledExactlyOnceWith('alice', 50, 'r1');
    expect(events('current bid')).toEqual([expect.objectContaining({room: 'r1', data: expect.objectContaining({bidder_id: 'alice'})})]);
});
it.each(['no identity', 'wrong bound room', 'left room'])('rejects a bid with %s before calling the auction service', async reason => {
    await start();
    if (reason === 'no identity') f.s.data.userid = '';
    if (reason === 'wrong bound room') f.s.data.roomid = 'other';
    if (reason === 'left room') f.s.rooms.delete('r1');
    await f.s.handlers.get('bid')!({userid: 'alice', bid: 50});
    await vi.advanceTimersByTimeAsync(0);
    expect(h.handleBid).not.toHaveBeenCalled();
    expect(events('current bid')).toEqual([]);
});
