import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repository, room, user } from '../test-support/fixtures';
import { RoomService } from './roomService';
let harness: ReturnType<typeof repository>, service: RoomService;
beforeEach(() => {
    harness = repository();
    service = new RoomService(harness.dependency);
});
describe("RoomService", () => {
    describe("player and room lookups", () => {
        it("should return a stored player and reject a lookup for a missing player", async () => {
            expect(await service.getUser('alice')).toEqual(user());
            await expect(service.getUser('missing')).rejects.toThrow();
        });
        it("should report whether a player exists", async () => {
            expect(await service.userExist('alice')).toBe(true);
            expect(await service.userExist('none')).toBe(false);
        });
        it("should return the room's player list, including an empty list", async () => {
            expect(await service.getUsers('r1')).toEqual(room().users);
            harness.rooms.get('r1')!.users = [];
            expect(await service.getUsers('r1')).toEqual([]);
        });
        it("should return the stored active status and room capacity status", async () => {
            expect(await service.getUserActiveStatus('alice')).toBe(true);
            expect(await service.checkWhetherFull('r1')).toBe(false);
            harness.rooms.get('r1')!.max = true;
            expect(await service.checkWhetherFull('r1')).toBe(true);
        });
        it("should reject required lookups when room storage is unavailable", async () => {
            harness.api.getRoom.mockRejectedValue(new Error('offline'));
            await expect(service.getUsers('r1')).rejects.toThrow('offline');
            await expect(service.checkWhetherFull('r1')).rejects.toThrow('offline');
        });
    });
    describe("matchmaking", () => {
        it("should create a waiting room when the auction queue is empty", async () => {
            harness.api.popRoomQueue.mockResolvedValue(null);
            const id = await service.findRoom('bob', 'Bob', 0);
            expect(harness.rooms.get(id)?.users).toEqual([{ userid: 'bob', username: 'Bob', active: true }]);
            expect(harness.api.pushRoomQueue).toHaveBeenCalledWith('Garage', id);
        });
        it("should create a waiting room when the queued room no longer exists", async () => {
            harness.api.popRoomQueue.mockResolvedValue('deleted');
            const id = await service.findRoom('bob', 'Bob', 0);
            expect(harness.rooms.has(id)).toBe(true);
            expect(id).not.toBe('deleted');
        });
        it("should join an available room for the selected auction", async () => {
            expect(await service.findRoom('bob', 'Bob', 0)).toBe('r1');
            expect(harness.rooms.get('r1')!.users.map(u => u.userid)).toEqual(['alice', 'bob']);
        });
        it("should initialize the player's balance from the selected auction and start with no won items", async () => {
            await service.findRoom('bob', 'Bob', 0);
            expect(harness.users.get('bob')).toEqual({ ...user(), username: 'Bob' });
        });
        it("should mark the room full when the final available player joins", async () => {
            await service.findRoom('bob', 'Bob', 0);
            expect(harness.rooms.get('r1')!.max).toBe(true);
        });
        it("should create a different room when the queued room is full or its game has started", async () => {
            for (const flag of ['max', 'in_progress'] as const) {
                harness.rooms.set('r1', Object.assign(room(), { [flag]: true }));
                const id = await service.findRoom('bob', 'Bob', 0);
                expect(id).not.toBe('r1');
                expect(harness.rooms.get(id)?.users).toHaveLength(1);
            }
        });
        it("should reject matchmaking when queue access or room or player persistence fails", async () => {
            for (const fn of [harness.api.popRoomQueue, harness.api.saveRoom, harness.api.saveUser]) {
                fn.mockRejectedValueOnce(new Error('offline'));
                await expect(service.findRoom('bob', 'Bob', 0)).rejects.toThrow('offline');
            }
        });
    });
    describe("player presence and removal", () => {
        it("should toggle the stored player's active status on disconnect and reconnect", async () => {
            await service.toggleSingleUserActiveStatus('alice');
            expect(harness.users.get('alice')!.active).toBe(false);
            await service.toggleSingleUserActiveStatus('alice');
            expect(harness.users.get('alice')!.active).toBe(true);
        });
        it("should mark a room participant active when their stored player record is active", async () => {
            harness.rooms.get('r1')!.users[0]!.active = false;
            expect((await service.toggleUsersActiveStatus('r1'))[0]!.active).toBe(true);
        });
        it("should report a missing player encountered while refreshing room participants", async () => {
            harness.users.clear();
            await expect(service.toggleUsersActiveStatus('r1')).rejects.toContain('not found');
        });
        it("should remove a player from their current room without removing other participants", async () => {
            harness.rooms.get('r1')!.users.push({ userid: 'bob', username: 'Bob', active: true });
            await service.kickUser('alice', 'r1');
            expect(harness.users.has('alice')).toBe(false);
            expect(harness.rooms.get('r1')!.users.map(u => u.userid)).toEqual(['bob']);
        });
        it("should leave a player untouched when removal targets a different room", async () => {
            await service.kickUser('alice', 'other');
            expect(harness.users.get('alice')).toEqual(user());
            expect(harness.api.saveRoom).not.toHaveBeenCalled();
        });
        it("should allow removal of an already missing player without failing", async () => {
            await expect(service.kickUser('absent', 'r1')).resolves.toBeUndefined();
            expect(harness.api.deleteUser).not.toHaveBeenCalled();
        });
        it("should delete the requested empty room", async () => {
            harness.rooms.get('r1')!.users = [];
            await service.deleteRoom('r1');
            expect(harness.rooms.has('r1')).toBe(false);
        });
    });
    describe("Proposed safeguards requiring approval: D1, D2, D7 in TEST_OUTLINES.md", () => {
        it.todo("should reject invalid auction indexes before changing any room or player state");
        it.todo("should keep only room IDs in matchmaking queues when skipping unavailable rooms");
        it.todo("should avoid adding the same player twice when a join is retried");
        it.todo("should prevent overlapping joins from exceeding the room's player limit");
        it.todo("should keep the room participant and stored player's active status synchronized in both directions");
        it.todo("should make setting all players active use the same room key as other room operations");
        it.todo("should distinguish a storage failure from a player that does not exist");
        it.todo("should report failed room deletion or presence updates to the caller");
    });
});
