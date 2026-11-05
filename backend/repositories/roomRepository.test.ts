import { describe, it, expect, vi, beforeEach } from 'vitest';
import { room, user, storage } from '../test-support/fixtures';
import { RoomRepository } from './roomRepository';
let harness: ReturnType<typeof storage>, repo: RoomRepository;
beforeEach(() => {
    harness = storage();
    repo = new RoomRepository(harness.client);
    harness.records.set('room:r1', JSON.stringify(room()));
    harness.records.set('user:alice', JSON.stringify(user()));
});
describe("RoomRepository", () => {
    describe("room storage", () => {
        it("should restore a stored room with its players, auction state, and current item intact", async () => {
            expect(await repo.getRoom('r1')).toEqual(room());
        });
        it("should return null when an optional room lookup finds no record", async () => {
            expect(await repo.findRoom('absent')).toBeNull();
        });
        it("should reject a required room lookup when the room is missing", async () => {
            await expect(repo.getRoom('absent')).rejects.toThrow('not found');
        });
        it("should preserve room data when saving and reading it back through the mocked client", async () => {
            const value = room();
            value.itemData!.bid = 70;
            await repo.saveRoom('r1', value);
            expect(await repo.getRoom('r1')).toEqual(value);
        });
        it("should delete only the requested room record", async () => {
            harness.records.set('room:r2', '{}');
            await repo.deleteRoom('r1');
            expect(harness.records.has('room:r1')).toBe(false);
            expect(harness.records.has('room:r2')).toBe(true);
        });
        it("should read a room from an explicitly supplied legacy storage key", async () => {
            harness.records.set('legacy', JSON.stringify(room()));
            expect(await repo.findRoomByKey('legacy')).toEqual(room());
        });
        it("should reject malformed stored room JSON instead of returning an unusable room", async () => {
            harness.records.set('room:r1', 'broken');
            await expect(repo.getRoom('r1')).rejects.toThrow();
        });
    });
    describe("player storage", () => {
        it("should restore a stored player's room, balance, active status, and items", async () => {
            expect(await repo.getUser('alice')).toEqual(user());
        });
        it("should return null for an optional lookup and reject a required lookup when a player is missing", async () => {
            expect(await repo.findUser('missing')).toBeNull();
            await expect(repo.getUser('missing')).rejects.toThrow('not found');
        });
        it("should report whether a player record exists without needing to deserialize it", async () => {
            harness.records.set('user:alice', 'not-json');
            expect(await repo.userExists('alice')).toBe(true);
            expect(await repo.userExists('none')).toBe(false);
        });
        it("should preserve player data when saving and reading it back through the mocked client", async () => {
            const value = user();
            value.balance = 42;
            await repo.saveUser('alice', value);
            expect(await repo.getUser('alice')).toEqual(value);
        });
        it("should delete only the requested player record", async () => {
            harness.records.set('user:bob', '{}');
            await repo.deleteUser('alice');
            expect(harness.records.has('user:alice')).toBe(false);
            expect(harness.records.has('user:bob')).toBe(true);
        });
        it("should reject malformed stored player JSON", async () => {
            harness.records.set('user:alice', 'broken');
            await expect(repo.getUser('alice')).rejects.toThrow();
        });
    });
    describe("matchmaking queues and dependency failures", () => {
        it("should return the next queued entry for the requested auction or null for an empty queue", async () => {
            expect(await repo.popRoomQueue('Garage')).toBeNull();
            await repo.pushRoomQueue('Garage', 'r1');
            expect(await repo.popRoomQueue('Garage')).toBe('r1');
            expect(await repo.popRoomQueue('Garage')).toBeNull();
        });
        it("should keep queued room entries separate between auction categories", async () => {
            await repo.pushRoomQueue('Garage', 'r1');
            await repo.pushRoomQueue('Beach', 'r2');
            expect(await repo.popRoomQueue('Beach')).toBe('r2');
            expect(await repo.popRoomQueue('Garage')).toBe('r1');
        });
        it("should reject failed reads, writes, deletions, and queue operations without reporting success", async () => {
            for (const [method, operation] of [[harness.client.get, () => repo.getRoom('r1')], [harness.client.set, () => repo.saveRoom('r1', room())], [harness.client.del, () => repo.deleteRoom('r1')], [harness.client.lPop, () => repo.popRoomQueue('Garage')], [harness.client.lPush, () => repo.pushRoomQueue('Garage', 'r1')]] as const) {
                method.mockRejectedValueOnce(new Error('offline'));
                await expect(operation()).rejects.toThrow('offline');
            }
        });
    });
});
