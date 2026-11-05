import { describe, it, expect, vi } from 'vitest';
import User from '../models/User';
import bcrypt from 'bcrypt';
import router from './userRoutes';
import { invoke } from '../test-support/routes';
describe('user route behavior with isolated persistence', () => {
    it('should successfully signup a new user', async () => {
        vi.spyOn(User, 'findOne').mockResolvedValue(null);
        vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
        const save = vi.spyOn(User.prototype, 'save').mockImplementation(async function () {
            return this;
        });
        const result = await invoke(router, '/signup', 'post', { username: 'Alice', password: 'pass1234' });
        expect(result.statusCode).toBe(201);
        expect(result.body).toEqual({ message: 'New User Created' });
        expect(save.mock.instances[0]).toMatchObject({ username: 'Alice', passwordHash: 'hashed-password', balance: 500 });
    });
    it('should reject an existing username', async () => {
        vi.spyOn(User, 'findOne').mockResolvedValue(new User({ username: 'Alice' }));
        const save = vi.spyOn(User.prototype, 'save');
        const result = await invoke(router, '/signup', 'post', { username: 'Alice', password: 'pass1234' });
        expect(result.statusCode).toBe(409);
        expect(save).not.toHaveBeenCalled();
    });
    it('should successfully login an existing user', async () => {
        const user = new User({ username: 'Alice', passwordHash: 'hashed', balance: 500 });
        vi.spyOn(User, 'findOne').mockResolvedValue(user);
        vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
        const result = await invoke(router, '/login', 'post', { username: 'Alice', password: 'pass1234' });
        expect(result.statusCode).toBe(200);
        expect(result.body).toEqual({ userid: user._id.toString(), username: 'Alice', balance: 500 });
        expect(result.cookie).toHaveBeenCalledWith(`token_${user._id}`, expect.any(String), expect.objectContaining({ httpOnly: true }));
    });
    it('should accept a nonempty password longer than eight characters at signup', async () => {
        vi.spyOn(User, 'findOne').mockResolvedValue(null);
        vi.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
        vi.spyOn(User.prototype, 'save').mockImplementation(async function () {
            return this;
        });
        const result = await invoke(router, '/signup', 'post', { username: 'Alice', password: 'SecurePassword123!' });
        expect(result.statusCode).toBe(201);
    });
});
const accountId = '507f1f77bcf86cd799439011';
// These route contracts cover useful gaps without adding new production rules.
describe('account and inventory access', () => {
    it.each(['/me', '/items', '/item/sell'])('rejects unauthenticated access to %s without querying persistence', async (path) => {
        const lookup = vi.spyOn(User, 'findById');
        const response = await invoke(router, path, 'post', { userid: accountId });
        expect(response.statusCode).toBe(401);
        expect(response.body).toEqual({ error: 'No token provided' });
        expect(lookup).not.toHaveBeenCalled();
    });
    it('returns the authenticated profile without exposing its password hash', async () => {
        const stored = new User({ _id: accountId, username: 'Alice', passwordHash: 'secret', balance: 500 });
        vi.spyOn(User, 'findById').mockResolvedValue(stored);
        const response = await invoke(router, '/me', 'post', { userid: accountId }, authCookie());
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ userid: accountId, username: 'Alice', balance: 500 });
    });
    it('returns only the authenticated player inventory', async () => {
        const inventory = [{ name: 'Watch', amount: 2 }];
        const lookup = vi.spyOn(Item, 'find').mockResolvedValue(inventory as never);
        const response = await invoke(router, '/items', 'post', { userid: accountId }, authCookie());
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ itemList: inventory });
        expect(lookup).toHaveBeenCalledWith({ owner: accountId });
    });
    it.each(['invalid', 'expired'])('rejects an %s account token before reading the profile', async (kind) => {
        const lookup = vi.spyOn(User, 'findById');
        const value = kind === 'invalid' ? 'invalid-token' : jwt.sign({ userid: accountId }, 'unit-test-only', { expiresIn: -1 });
        const response = await invoke(router, '/me', 'post', { userid: accountId }, { [`token_${accountId}`]: value });
        expect(response.statusCode).toBe(401);
        expect(lookup).not.toHaveBeenCalled();
    });
    it('clears the player cookie on logout', async () => {
        const response = await invoke(router, '/logout', 'post', { userid: accountId });
        expect(response.clearCookie).toHaveBeenCalledWith(`token_${accountId}`, expect.objectContaining({ httpOnly: true }));
        expect(response.body).toEqual({ message: 'Logged out successfully' });
    });
});
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import Item from '../models/Item';
function authCookie() {
    return { [`token_${accountId}`]: jwt.sign({ userid: accountId, username: 'Alice' }, 'unit-test-only', { expiresIn: '20m' }) };
}
describe('selling owned inventory', () => {
    it.each([
        { label: 'a partial stack', sold: 1, remaining: 2 },
        { label: 'the entire stack', sold: 3, remaining: 0 },
    ])('sells $label and credits the stored item value', async ({ sold, remaining }) => {
        const ownedItem = new Item({
            hashcode: 'stored-hash', name: 'Watch', value: 50, amount: 3,
            description: 'Vintage watch', rarity: 'Pawnshop', img_url: 'watch.svg', owner: accountId,
        });
        const inventory = remaining ? [{ name: 'Watch', amount: remaining }] : [];
        const findOwned = vi.spyOn(Item, 'findOne').mockResolvedValue(ownedItem);
        vi.spyOn(Item, 'find').mockResolvedValue(inventory as never);
        const update = vi.spyOn(Item, 'findByIdAndUpdate').mockResolvedValue(null);
        const remove = vi.spyOn(Item, 'findByIdAndDelete').mockResolvedValue(null);
        const credit = vi.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(null);
        vi.spyOn(User, 'findById').mockResolvedValue(new User({ _id: accountId, username: 'Alice', balance: 500 + sold * 50 }));
        const response = await invoke(router, '/item/sell', 'post', {
            userid: accountId, itemName: 'Watch', quantitySold: sold,
        }, authCookie());
        expect(findOwned).toHaveBeenCalledExactlyOnceWith({ hashcode: crypto.createHash('sha256').update('Watch' + accountId).digest('hex') });
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ newBalance: 500 + sold * 50, itemList: inventory });
        expect(credit).toHaveBeenCalledExactlyOnceWith(accountId, { $inc: { balance: sold * 50 } });
        if (remaining) {
            expect(update).toHaveBeenCalledExactlyOnceWith(ownedItem._id, { amount: remaining });
            expect(remove).not.toHaveBeenCalled();
        }
        else {
            expect(remove).toHaveBeenCalledExactlyOnceWith(ownedItem._id);
            expect(update).not.toHaveBeenCalled();
        }
    });
});
