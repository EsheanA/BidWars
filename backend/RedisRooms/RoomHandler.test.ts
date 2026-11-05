import { describe, it, expect, vi, beforeEach } from 'vitest';
const deps = vi.hoisted(() => ({
    connect: vi.fn(), on: vi.fn(), flush: vi.fn(), room: vi.fn(), auction: vi.fn(), reward: vi.fn()
}));
vi.mock('redis', () => ({ createClient: vi.fn(() => ({ connect: deps.connect, on: deps.on, flushDb: deps.flush })) }));
vi.mock('../itemGeneration/grok', () => ({ default: vi.fn() }));
vi.mock('../services/roomService', () => ({ RoomService: vi.fn(function () {
        return Object.assign({ marker: 'room-service' }, Object.fromEntries([
            'getUser', 'userExist', 'findRoom', 'toggleUsersActiveStatus', 'toggleSingleUserActiveStatus', 'setUsersToActive', 'getUserActiveStatus', 'getUsers', 'checkWhetherFull', 'kickUser', 'deleteRoom'
        ].map(k => [k, deps.room])));
    }) }));
vi.mock('../services/auctionService', () => ({ AuctionService: vi.fn(function () {
        return Object.fromEntries(['handleBid', 'getPreGameData', 'setItem', 'checkGameStarted', 'startGame'].map(k => [k, deps.auction]));
    }) }));
vi.mock('../services/rewardService', () => ({ RewardService: vi.fn(function () {
        return { distributeItemDB: deps.reward, logItem: deps.reward };
    }) }));
import { createClient } from 'redis';
beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    deps.connect.mockResolvedValue(undefined);
});
import type RoomHandler from './RoomHandler';
const load = async (): Promise<typeof RoomHandler> => (await import('./RoomHandler.js')).default as unknown as typeof RoomHandler;
async function compatibility(methods: string[], fn: ReturnType<typeof vi.fn>) {
    const handler = await load();
    for (const method of methods) {
        fn.mockResolvedValueOnce('result');
        expect(await (handler as any)[method]('alice', 42)).toBe('result');
        expect(fn).toHaveBeenLastCalledWith('alice', 42);
        fn.mockRejectedValueOnce(new Error('offline'));
        await expect((handler as any)[method]('alice')).rejects.toThrow('offline');
    }
}
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
        it("should preserve room-operation arguments, results, and failures through the compatibility entry point", async () => {
            await compatibility([
                'getUser', 'userExist', 'findRoom', 'toggleUsersActiveStatus', 'toggleSingleUserActiveStatus', 'setUsersToActive', 'getUserActiveStatus', 'getUsers', 'checkWhetherFull', 'kickUser', 'deleteRoom'
            ], deps.room);
        });
        it("should preserve auction-operation arguments, results, and failures through the compatibility entry point", async () => {
            await compatibility(['handleBid', 'getPreGameData', 'setItem', 'checkGameStarted', 'startGame'], deps.auction);
        });
        it("should preserve reward-operation arguments, results, and failures through the compatibility entry point", async () => {
            await compatibility(['distributeItemDB', 'logItem'], deps.reward);
        });
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
    describe("Proposed safeguard requiring approval: D6 in TEST_OUTLINES.md", () => {
        it.todo("should preserve existing rooms and players when the Redis client connects or reconnects");
    });
});
