import { boundaryIndexes, invalidInternalIndexes } from '../test-support/auctionIndexes';
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
        it("should keep each room's player and item lists independent", async () => {
            const a = new Room('Garage', 0), b = new Room('Garage', 0);
            a.users.push({ userid: 'x', username: 'X', active: true });
            a.items.push(item);
            expect(b.users).toEqual([]);
            expect(b.items).toEqual([]);
        });
    });
    describe("Auction-index regressions", () => {
        it("should reject an invalid auction index instead of creating a room with undefined bid options", async () => {
            for (const value of invalidInternalIndexes) {
                expect(() => new Room('Garage', value as number)).toThrow('Invalid auction index');
            }
            expect(uuid).not.toHaveBeenCalled();
            const existing = new Room('Garage', 0);
            for (const value of invalidInternalIndexes) {
                expect(() => existing.setBidOptions(value as number)).toThrow('Invalid auction index');
            }
            expect(existing.bid_options).toEqual([5, 10, 20]);
        });
    });
});
it.each(boundaryIndexes)('constructs a room for boundary auction %s', index => {
    const value = new Room('Selected auction', index);
    expect(value.auctionIndex).toBe(index);
    expect(value.bid_options.length).toBeGreaterThan(0);
});
it('initializes an independent waiting room with the selected auction defaults', () => {
    const first = new Room('Garage', 0);
    const second = new Room('Garage', 0);
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ auction: 'Garage', auctionIndex: 0, users: [], items: [], itemData: null, limit: 2, rounds: 3, in_progress: false, max: false, bid_options: [5, 10, 20] });
});
