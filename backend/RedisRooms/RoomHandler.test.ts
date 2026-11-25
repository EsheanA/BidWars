import { describe, it, expect, vi, beforeEach } from 'vitest';
const deps = vi.hoisted(() => ({
    connect: vi.fn(), close: vi.fn(), destroy: vi.fn(), isOpen: false, isReady: false,
    on: vi.fn(), flush: vi.fn(), room: vi.fn(), auction: vi.fn(), reward: vi.fn()
}));
vi.mock('redis', () => ({ createClient: vi.fn(() => ({
    connect: deps.connect, close: deps.close, destroy: deps.destroy, on: deps.on, flushDb: deps.flush,
    get isOpen() { return deps.isOpen; }, get isReady() { return deps.isReady; }
})) }));
vi.mock('../itemGeneration/grok', () => ({ default: vi.fn(), generateDraft: vi.fn(), generateAudio: vi.fn(), discardAudio: vi.fn() }));
vi.mock('../services/roomService', () => ({ RoomService: vi.fn(function () {
        return Object.assign({ marker: 'room-service' }, Object.fromEntries([
            'getUser', 'userExist', 'findRoom', 'toggleUsersActiveStatus', 'toggleSingleUserActiveStatus', 'setUsersToActive', 'getUserActiveStatus', 'getUsers', 'checkWhetherFull', 'kickUser', 'deleteRoom'
        ].map(k => [k, deps.room])));
    }) }));
vi.mock('../services/auctionService', () => ({ AuctionService: vi.fn(function () {
        return Object.fromEntries(['handleBid', 'getPreGameData', 'setItem', 'prepareItem', 'activatePreparedItem', 'discardPreparedItem', 'checkGameStarted', 'startGame'].map(k => [k, deps.auction]));
    }) }));
vi.mock('../services/rewardService', () => ({ RewardService: vi.fn(function () {
        return { distributeItemDB: deps.reward, logItem: deps.reward };
    }) }));
import { createClient } from 'redis';
beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    deps.connect.mockResolvedValue(undefined);
    deps.isOpen = false;
    deps.isReady = false;
    deps.close.mockImplementation(async () => { deps.isOpen = false; });
    deps.destroy.mockImplementation(() => { deps.isOpen = false; });
});
import type RoomHandler from './RoomHandler';
const load = async (): Promise<typeof RoomHandler> => (await import('./RoomHandler.js')).default as unknown as typeof RoomHandler;
describe("RoomHandler compatibility entry point", () => {
    describe("initialization", () => {
        it("should reject initialization when REDIS_URL is missing", async () => {
            vi.stubEnv('REDIS_URL', '');
            await expect(load()).rejects.toThrow('REDIS_URL');
            expect(createClient).not.toHaveBeenCalled();
        });
        it("should create its client from the configured Redis URL without connecting until initClient is called", async () => {
            await load();
            expect(createClient).toHaveBeenCalledWith({ url: 'unit-test-only' });
            expect(deps.connect).not.toHaveBeenCalled();
            expect(deps.flush).not.toHaveBeenCalled();
        });
        it("should resolve initClient after the mocked client connects", async () => {
            const h = await load();
            await expect(h.initClient()).resolves.toBeUndefined();
            expect(deps.connect).toHaveBeenCalledOnce();
        });
        it("should reject initClient when the mocked client cannot connect", async () => {
            deps.connect.mockRejectedValueOnce(new Error('offline'));
            await expect((await load()).initClient()).rejects.toThrow('offline');
        });
    });
    describe("service compatibility", () => {
        it("should keep service methods usable when a caller takes a method from the exported object", async () => {
            const { getUser } = await load();
            deps.room.mockImplementationOnce(function (this: {
                marker: string;
            }) {
                return Promise.resolve({ username: this.marker });
            });
            expect(await getUser('alice')).toEqual({ username: 'room-service' });
        });
    });
});

it('bounds initial Redis retries to ten seconds and destroys the connecting client on timeout', async () => {
    vi.useFakeTimers();
    const h = await load();
    deps.isOpen = true;
    deps.connect.mockReturnValueOnce(new Promise(() => {}));
    const failed = expect(h.initClient()).rejects.toThrow('Redis startup timed out');
    await vi.advanceTimersByTimeAsync(10000);
    await failed;
    expect(deps.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
});

it.each(['ready', 'connecting', 'forced', 'already closed'])('closes a %s Redis client safely and idempotently', async state => {
    const h = await load();
    deps.isOpen = state !== 'already closed';
    deps.isReady = state === 'ready' || state === 'forced';
    await h.closeClient(state === 'forced');
    await h.closeClient();
    expect(deps.close).toHaveBeenCalledTimes(state === 'ready' ? 1 : 0);
    expect(deps.destroy).toHaveBeenCalledTimes(state === 'connecting' || state === 'forced' ? 1 : 0);
    expect(deps.flush).not.toHaveBeenCalled();
});
