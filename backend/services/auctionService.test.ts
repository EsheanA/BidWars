import { boundaryIndexes, invalidInternalIndexes } from '../test-support/auctionIndexes';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repository, room, item, generated, deferred } from '../test-support/fixtures';
import { AuctionService } from './auctionService';
let harness: ReturnType<typeof repository>, service: AuctionService, generate: ReturnType<typeof vi.fn<(auctionIndex: number) => Promise<string>>>;
beforeEach(() => {
    harness = repository();
    generate = vi.fn(async () => JSON.stringify(generated));
    service = new AuctionService(harness.dependency, generate);
});
describe("AuctionService", () => {
    describe("bidding", () => {
        it("should accept an active player's affordable bid and record the winning player and amount", async () => {
            expect(await service.handleBid('alice', 75, 'r1')).toEqual({ userid: 'alice', bid: 75, roomid: 'r1' });
            expect(harness.rooms.get('r1')!.itemData).toMatchObject({ bid: 75, bidder_id: 'alice' });
        });
        it("should accept a bid equal to the player's remaining balance", async () => {
            expect((await service.handleBid('alice', 250, 'r1')).userid).toBe('alice');
        });
        it("should reject a bid above the player's balance without changing the current item", async () => {
            expect((await service.handleBid('alice', 251, 'r1')).userid).toBe('');
            expect(harness.rooms.get('r1')!.itemData).toEqual(item);
            expect(harness.api.saveRoom).not.toHaveBeenCalled();
        });
        it("should reject an inactive player's bid without changing the current item", async () => {
            harness.users.get('alice')!.active = false;
            expect((await service.handleBid('alice', 50, 'r1')).userid).toBe('');
            expect(harness.api.saveRoom).not.toHaveBeenCalled();
        });
        it("should leave the player's balance unchanged until the round is settled", async () => {
            await service.handleBid('alice', 50, 'r1');
            expect(harness.users.get('alice')!.balance).toBe(250);
            expect(harness.api.saveUser).not.toHaveBeenCalled();
        });
        it("should reject a bid when the player, room, or current item is missing", async () => {
            for (const variant of ['user', 'room', 'item']) {
                harness = repository();
                service = new AuctionService(harness.dependency, generate);
                if (variant === 'user')
                    harness.users.clear();
                if (variant === 'room')
                    harness.rooms.clear();
                if (variant === 'item')
                    harness.rooms.get('r1')!.itemData = null;
                await expect(service.handleBid('alice', 50, 'r1')).rejects.toBeTruthy();
            }
        });
        it("should report a failed bid read or write without returning an accepted bid", async () => {
            for (const fn of [harness.api.getUser, harness.api.getRoom, harness.api.saveRoom]) {
                fn.mockRejectedValueOnce(new Error('offline'));
                await expect(service.handleBid('alice', 50, 'r1')).rejects.toContain('offline');
            }
        });
    });
    describe("item preparation and game state", () => {
        it("should return pregame JSON containing rounds, item_data, max_balance, and bid_options", async () => {
            expect(JSON.parse(await service.getPreGameData('r1'))).toMatchObject({
                rounds: 3, max_balance: 250, bid_options: [5, 10, 20], item_data: { name: 'Watch' }
            });
        });
        it("should replace the previous item and reset its bidder and bid to the new starting state", async () => {
            harness.rooms.get('r1')!.itemData!.bid = 100;
            expect(await service.setItem('r1')).toEqual({ ...item, bidder_id: '' });
            expect(generate).toHaveBeenCalledWith(0);
        });
        it("should leave the stored room unchanged when item generation fails or returns invalid JSON", async () => {
            for (const fail of [true, false]) {
                generate.mockImplementationOnce(async () => {
                    if (fail)
                        throw new Error('offline');
                    return 'broken';
                });
                await expect(service.setItem('r1')).rejects.toBeTruthy();
                expect(harness.rooms.get('r1')).toEqual(room());
            }
        });
        it("should report a failure to persist the generated item", async () => {
            harness.api.saveRoom.mockRejectedValue(new Error('offline'));
            await expect(service.setItem('r1')).rejects.toThrow('offline');
        });
        it("should mark a room's game started and return its started status on later checks", async () => {
            expect(await service.checkGameStarted('r1')).toBe(false);
            await service.startGame('r1');
            expect(await service.checkGameStarted('r1')).toBe(true);
        });
        it("should reject game-state operations when the room is missing or storage fails", async () => {
            harness.rooms.clear();
            await expect(service.startGame('r1')).rejects.toThrow();
            await expect(service.checkGameStarted('r1')).rejects.toThrow();
            harness.api.getRoom.mockRejectedValue(new Error('offline'));
            await expect(service.startGame('r1')).rejects.toThrow('offline');
        });
    });
    describe("Auction-index regressions", () => {
        it("should reject a room with an invalid auction index before generating or saving an item", async () => {
            for (const value of invalidInternalIndexes) {
                harness.rooms.get('r1')!.auctionIndex = value as number;
                const before = structuredClone(harness.rooms.get('r1'));
                await expect(service.getPreGameData('r1')).rejects.toThrow('Invalid auction index');
                await expect(service.setItem('r1')).rejects.toThrow('Invalid auction index');
                await expect(service.startGame('r1')).rejects.toThrow('Invalid auction index');
                expect(harness.rooms.get('r1')).toEqual(before);
            }
            expect(generate).not.toHaveBeenCalled();
            expect(harness.api.saveRoom).not.toHaveBeenCalled();
            expect(harness.api.saveUser).not.toHaveBeenCalled();
        });
    });
});
it.each(boundaryIndexes)('prepares items for boundary auction %s', async (index) => {
    harness.rooms.get('r1')!.auctionIndex = index;
    await service.getPreGameData('r1');
    await service.setItem('r1');
    expect(generate).toHaveBeenNthCalledWith(1, index);
    expect(generate).toHaveBeenNthCalledWith(2, index);
    expect(harness.rooms.get('r1')!.auctionIndex).toBe(index);
});

it.each(['different stored room', 'missing room membership'])('rejects a bid with %s without changing state', async reason => {
    if (reason === 'different stored room') harness.users.get('alice')!.roomid = 'other';
    else harness.rooms.get('r1')!.users = [];
    const before = structuredClone(harness.rooms.get('r1'));
    await expect(service.handleBid('alice', 50, 'r1')).rejects.toContain(reason === 'different stored room' ? 'Not authorized' : 'Not a participant');
    expect(harness.api.saveRoom).not.toHaveBeenCalled();
    expect(harness.rooms.get('r1')).toEqual(before);
});

const target = { roomId: 'r1', gameId: 'g1', round: 2, transitionId: 't1' };
function backgroundService() {
    const source = {
        generateDraft: vi.fn(async () => generated),
        generateAudio: vi.fn(async () => generated.audio_url),
        discardAudio: vi.fn(async () => {})
    };
    harness.rooms.get('r1')!.in_progress = true;
    service = new AuctionService(harness.dependency, generate, source);
    return source;
}
it('prepares without writing room or user data, then activates against fresh post-settlement state', async () => {
    const source = backgroundService();
    const draft = deferred<typeof generated>();
    source.generateDraft.mockReturnValueOnce(draft.promise);
    const before = structuredClone(harness.rooms.get('r1'));
    const preparing = service.prepareItem(target, new AbortController().signal);
    await vi.waitFor(() => expect(source.generateDraft).toHaveBeenCalledOnce());
    expect(harness.rooms.get('r1')).toEqual(before);
    expect(harness.api.saveRoom).not.toHaveBeenCalled();
    await service.handleBid('alice', 75, 'r1');
    harness.api.saveRoom.mockClear();
    draft.resolve(generated);
    const prepared = await preparing;
    expect(harness.rooms.get('r1')!.itemData).toMatchObject({ bid: 75, bidder_id: 'alice' });
    expect(harness.api.saveRoom).not.toHaveBeenCalled();
    expect(harness.api.saveUser).not.toHaveBeenCalled();

    // These changes happen after preparation and must survive activation.
    harness.rooms.get('r1')!.users.push({ userid: 'bob', username: 'Bob', active: true });
    harness.rooms.get('r1')!.items.push({ ...item, name: 'Awarded' });
    harness.users.get('alice')!.balance = 200;
    await service.activatePreparedItem(target, prepared, new AbortController().signal);
    expect(harness.rooms.get('r1')!.itemData).toEqual({ ...item, bidder_id: '' });
    expect(harness.rooms.get('r1')!.users).toHaveLength(2);
    expect(harness.rooms.get('r1')!.items[0]!.name).toBe('Awarded');
    expect(harness.users.get('alice')!.balance).toBe(200);
});
it.each(['gameId', 'roomId', 'round', 'transitionId'] as const)('rejects a stale prepared %s before saving', async field => {
    backgroundService();
    const signal = new AbortController().signal;
    const prepared = await service.prepareItem(target, signal);
    const stale = { ...prepared, [field]: field === 'round' ? 3 : 'other' };
    await expect(service.activatePreparedItem(target, stale, signal)).rejects.toThrow('does not belong');
    expect(harness.api.saveRoom).not.toHaveBeenCalled();
});
it.each(['deleted', 'empty', 'stopped', 'auction changed', 'cancelled'])('does not activate a prepared item when the game is %s', async reason => {
    backgroundService();
    const controller = new AbortController();
    const prepared = await service.prepareItem(target, controller.signal);
    if (reason === 'deleted') harness.rooms.clear();
    if (reason === 'empty') harness.rooms.get('r1')!.users = [];
    if (reason === 'stopped') harness.rooms.get('r1')!.in_progress = false;
    if (reason === 'auction changed') harness.rooms.get('r1')!.auctionIndex = 1;
    if (reason === 'cancelled') controller.abort();
    await expect(service.activatePreparedItem(target, prepared, controller.signal)).rejects.toThrow();
    expect(harness.api.saveRoom).not.toHaveBeenCalled();
});
it('rejects an invalid auction before any background provider call', async () => {
    const source = backgroundService();
    harness.rooms.get('r1')!.auctionIndex = -1;
    await expect(service.prepareItem(target, new AbortController().signal)).rejects.toThrow('Invalid auction index');
    expect(source.generateDraft).not.toHaveBeenCalled();
    expect(source.generateAudio).not.toHaveBeenCalled();
    expect(harness.api.saveRoom).not.toHaveBeenCalled();
});

it('stops preparation before the next provider stage if the room is deleted', async () => {
    const source = backgroundService();
    source.generateDraft.mockImplementationOnce(async () => { harness.rooms.clear(); return generated; });
    await expect(service.prepareItem(target, new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(source.generateAudio).not.toHaveBeenCalled();
    expect(harness.api.saveRoom).not.toHaveBeenCalled();
});

it('retries a temporary preparation-room read failure without calling a provider or mutating storage first', async () => {
    vi.useFakeTimers();
    const source = backgroundService();
    harness.api.findRoom.mockRejectedValueOnce(new Error('Redis unavailable'));
    const task = service.prepareItem(target, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(source.generateDraft).not.toHaveBeenCalled();
    expect(harness.api.saveRoom).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await task).item.name).toBe('Watch');
    expect(source.generateDraft).toHaveBeenCalledOnce();
    expect(source.generateAudio).toHaveBeenCalledOnce();
});
