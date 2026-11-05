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
