import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repository, user } from '../test-support/fixtures';
import { RewardService } from './rewardService';
import Item from '../models/Item';
import User from '../models/User';
let harness: ReturnType<typeof repository>, service: RewardService;
let save: any, find: any, update: any, charge: any;
beforeEach(() => {
    harness = repository();
    service = new RewardService(harness.dependency);
    find = vi.spyOn(Item, 'findOne').mockResolvedValue(null);
    update = vi.spyOn(Item, 'findOneAndUpdate').mockResolvedValue(null);
    save = vi.spyOn(Item.prototype, 'save').mockImplementation(async function () {
        return this;
    });
    charge = vi.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(null);
});
describe("RewardService", () => {
    describe("persistent inventory and balances", () => {
        it("should create the winner's first copy of an item with its ownership, value, rarity, bid, and media details", async () => {
            harness.rooms.get('r1')!.itemData!.bidder_id = '507f1f77bcf86cd799439011';
            await service.distributeItemDB('r1');
            expect(save).toHaveBeenCalledOnce();
            expect(save.mock.instances[0].owner.toString()).toBe('507f1f77bcf86cd799439011');
            expect(save.mock.instances[0]).toMatchObject({
                name: 'Watch', value: 150, amount: 1, bid: 25, img_url: 'watch.svg', audio_url: 'audioFiles/watch.mp3', rarity: 'Pawnshop'
            });
        });
        it("should increment the winner's existing item quantity instead of creating another inventory entry", async () => {
            find.mockResolvedValue({ amount: 2 });
            await service.distributeItemDB('r1');
            expect(update).toHaveBeenCalledWith(expect.any(Object), { $inc: { amount: 1 } });
            expect(save).not.toHaveBeenCalled();
        });
        it("should keep different winners' inventory entries separate even when they win identically named items", async () => {
            await service.distributeItemDB('r1');
            const first = find.mock.calls[0][0].hashcode;
            harness.rooms.get('r1')!.itemData!.bidder_id = 'bob';
            await service.distributeItemDB('r1');
            expect(find.mock.calls[1][0].hashcode).not.toBe(first);
        });
        it("should deduct the winning bid from the winner's persistent balance after storing the item", async () => {
            await service.distributeItemDB('r1');
            expect(charge).toHaveBeenCalledWith('alice', { $inc: { balance: -25 } });
            expect(save.mock.invocationCallOrder[0]).toBeLessThan(charge.mock.invocationCallOrder[0]);
        });
    });
    describe("in-game round settlement", () => {
        it("should reject in-game settlement when the room, item, or winning player is missing", async () => {
            for (const missing of ['room', 'item', 'player']) {
                harness = repository();
                service = new RewardService(harness.dependency);
                if (missing === 'room')
                    harness.rooms.clear();
                if (missing === 'item')
                    harness.rooms.get('r1')!.itemData = null;
                if (missing === 'player')
                    harness.users.clear();
                await expect(service.logItem('r1')).rejects.toThrow();
            }
        });
        it("should report failed in-game balance or room updates", async () => {
            for (const fn of [harness.api.saveRoom, harness.api.saveUser]) {
                fn.mockRejectedValueOnce(new Error('offline'));
                await expect(service.logItem('r1')).rejects.toThrow('offline');
            }
        });
    });
});
it('settles the winner in game, returns their balance, and clears the round bid', async () => {
    harness.users.set('bob', { ...user(), balance: 99 });
    expect(await service.logItem('r1')).toEqual({ userid: 'alice', balance: 225 });
    expect(harness.users.get('alice')!.balance).toBe(225);
    expect(harness.users.get('bob')!.balance).toBe(99);
    expect(harness.rooms.get('r1')!.itemData).toMatchObject({ bid: 0, bidder_id: '' });
});
