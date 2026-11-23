import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { generateAccessToken, generateRoomAccessToken } from './generateToken';
import { verifyAccessToken, verifyRoomAccessToken } from './verifyToken';

const user = {_id: 'alice', username: 'Alice'};
const sign = (payload: object, options: jwt.SignOptions = {}) => jwt.sign(payload, 'unit-test-only', {expiresIn: '20m', ...options});
const access = {userid: 'alice', username: 'Alice', purpose: 'access'};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01')); });

describe('token verification contract', () => {
    it('accepts newly issued tokens only for their purpose and player', () => {
        expect(verifyAccessToken(generateAccessToken(user), 'alice')).toMatchObject(access);
        expect(verifyRoomAccessToken(generateRoomAccessToken(user, 'r1'), 'alice')).toMatchObject({userid: 'alice', purpose: 'room', roomid: 'r1'});
        expect(() => verifyAccessToken(generateAccessToken(user), 'bob')).toThrow();
        expect(() => verifyRoomAccessToken(generateRoomAccessToken(user, 'r1'), 'bob')).toThrow();
    });
    it('rejects interchangeable tokens and legacy tokens without a purpose', () => {
        expect(() => verifyAccessToken(generateRoomAccessToken(user, 'r1'), 'alice')).toThrow();
        expect(() => verifyRoomAccessToken(generateAccessToken(user), 'alice')).toThrow();
        expect(() => verifyAccessToken(sign({userid: 'alice', username: 'Alice'}), 'alice')).toThrow();
    });
    it('rejects missing, blank, or incorrectly typed required claims', () => {
        for (const field of ['userid', 'username', 'purpose']) {
            for (const invalid of [undefined, '', ' ', 42, ['alice']]) {
                expect(() => verifyAccessToken(sign({...access, [field]: invalid}), 'alice')).toThrow();
            }
        }
        for (const roomid of [undefined, '', ' ', 1]) {
            expect(() => verifyRoomAccessToken(sign({...access, purpose: 'room', roomid}), 'alice')).toThrow();
        }
    });
    it('requires expiry and issue time, and rejects expired tokens and other signing algorithms', () => {
        expect(() => verifyAccessToken(jwt.sign(access, 'unit-test-only'), 'alice')).toThrow();
        expect(() => verifyAccessToken(sign(access, {noTimestamp: true}), 'alice')).toThrow();
        expect(() => verifyAccessToken(sign(access, {expiresIn: -1}), 'alice')).toThrow();
        expect(() => verifyAccessToken(sign(access, {algorithm: 'HS384'}), 'alice')).toThrow();
    });
});
