import { describe, it, expect, vi, beforeEach } from 'vitest';
import { item } from '../test-support/fixtures';
import Room from './Room';
vi.mock('uuidv4', () => ({ uuid: vi.fn() }));
import { uuid } from 'uuidv4';
beforeEach(() => {
    vi.mocked(uuid).mockReturnValueOnce('one').mockReturnValueOnce('two');
});
describe("Room", () => {
    describe("initial room state", () => {
        it("should create a distinct room ID for each room", async () => {
            expect(new Room('Garage', 0).id).not.toBe(new Room('Garage', 0).id);
        });
        it("should retain the selected auction name and index", async () => {
            expect(new Room('Garage', 0)).toMatchObject({ auction: 'Garage', auctionIndex: 0 });
        });
        it("should start with empty player and item lists and no current item", async () => {
            expect(new Room('Garage', 0)).toMatchObject({ users: [], items: [], itemData: null });
        });
        it("should start with two available player slots, three rounds, and no active game", async () => {
            expect(new Room('Garage', 0)).toMatchObject({
                limit: 2, rounds: 3, in_progress: false, max: false
            });
        });
        it("should load bid options for the selected auction", async () => {
            expect(new Room('Garage', 0).bid_options).toEqual([5, 10, 20]);
        });
        it("should keep each room's player and item lists independent", async () => {
            const a = new Room('Garage', 0), b = new Room('Garage', 0);
            a.users.push({ userid: 'x', username: 'X', active: true });
            a.items.push(item);
            expect(b.users).toEqual([]);
            expect(b.items).toEqual([]);
        });
    });
    describe("Proposed safeguards requiring approval: D1, D2 in TEST_OUTLINES.md", () => {
        it.todo("should reject an invalid auction index instead of creating a room with undefined bid options");
        it.todo("should prevent changing one room's bid options from changing other rooms or the auction configuration");
    });
});
