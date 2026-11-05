import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { generateAccessToken, generateRoomAccessToken } from './generateToken';
const user = { _id: 'alice', username: 'Alice' };
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
function claims(token: string) {
    return jwt.verify(token, 'unit-test-only') as jwt.JwtPayload;
}
describe("token generation", () => {
    describe("generateAccessToken", () => {
        it("should issue a verifiable token containing the user's ID and username", async () => {
            expect(claims(generateAccessToken(user))).toMatchObject({ userid: 'alice', username: 'Alice' });
        });
        it("should expire the access token twenty minutes after issuance", async () => {
            const token = generateAccessToken(user), c = claims(token);
            expect(c.exp! - c.iat!).toBe(1200);
            vi.advanceTimersByTime(1200000);
            expect(() => claims(token)).toThrow('expired');
        });
        it("should omit passwords and other unrelated user fields from the token", async () => {
            const token = generateAccessToken({ ...user, passwordHash: 'secret' } as typeof user);
            expect(claims(token)).not.toHaveProperty('passwordHash');
            expect(Object.keys(claims(token)).sort()).toEqual(['exp', 'iat', 'userid', 'username']);
        });
        it("should reject token generation when ACCESS_TOKEN_SECRET is missing or signing fails", async () => {
            vi.stubEnv('ACCESS_TOKEN_SECRET', '');
            expect(() => generateAccessToken(user)).toThrow('undefined');
            vi.stubEnv('ACCESS_TOKEN_SECRET', 'unit-test-only');
            vi.spyOn(jwt, 'sign').mockImplementation(() => {
                throw new Error('signing failed');
            });
            expect(() => generateAccessToken(user)).toThrow('signing failed');
        });
    });
    describe("generateRoomAccessToken", () => {
        it("should issue a verifiable token containing the user's identity and the specified room ID", async () => {
            expect(claims(generateRoomAccessToken(user, 'r1'))).toMatchObject({ userid: 'alice', username: 'Alice', roomid: 'r1' });
        });
        it("should expire the room token five minutes after issuance", async () => {
            const token = generateRoomAccessToken(user, 'r1'), c = claims(token);
            expect(c.exp! - c.iat!).toBe(300);
            vi.advanceTimersByTime(300000);
            expect(() => claims(token)).toThrow('expired');
        });
        it("should issue tokens bound to the requested room without changing the input user", async () => {
            const original = { ...user };
            expect(claims(generateRoomAccessToken(user, 'r2')).roomid).toBe('r2');
            expect(user).toEqual(original);
        });
        it("should reject room-token generation when ACCESS_TOKEN_SECRET is missing or signing fails", async () => {
            vi.stubEnv('ACCESS_TOKEN_SECRET', '');
            expect(() => generateRoomAccessToken(user, 'r1')).toThrow();
            vi.stubEnv('ACCESS_TOKEN_SECRET', 'unit-test-only');
            vi.spyOn(jwt, 'sign').mockImplementation(() => {
                throw new Error('signing failed');
            });
            expect(() => generateRoomAccessToken(user, 'r1')).toThrow('signing failed');
        });
    });
    describe("Proposed safeguard requiring approval: D5 in TEST_OUTLINES.md", () => {
        it.todo("should distinguish account access tokens from room access tokens with an enforceable token purpose");
    });
});
