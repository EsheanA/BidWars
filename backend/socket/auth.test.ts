import { describe, it, expect, vi, beforeEach } from 'vitest';
import { room, item, user, socket, socketServer } from '../test-support/fixtures';
vi.mock('../RedisRooms/RoomHandler', () => ({ default: {
        initClient: vi.fn(), getPreGameData: vi.fn(), startGame: vi.fn(), toggleUsersActiveStatus: vi.fn(), handleBid: vi.fn(), distributeItemDB: vi.fn(), logItem: vi.fn(), setItem: vi.fn(), getUser: vi.fn(), toggleSingleUserActiveStatus: vi.fn(), findRoom: vi.fn(), getUsers: vi.fn(), checkWhetherFull: vi.fn(), checkGameStarted: vi.fn(), kickUser: vi.fn(), deleteRoom: vi.fn(), userExist: vi.fn()
    } }));
import handler from '../RedisRooms/RoomHandler';
const h = vi.mocked(handler);
import { socketAuth } from './auth';
import jwt from 'jsonwebtoken';
let s: any, next: any;
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01'));
    vi.clearAllMocks();
    h.checkGameStarted.mockResolvedValue(true);
    h.userExist.mockResolvedValue(true);
    s = { handshake: { auth: { userid: 'alice' }, query: { auctionIndex: '0' }, headers: { cookie: '' } } };
    next = vi.fn();
});
function token(payload: any = { userid: 'alice', username: 'Alice' }, options: jwt.SignOptions = {}) {
    return jwt.sign(payload, 'unit-test-only', { expiresIn: '20m', ...options });
}
describe("socketAuth", () => {
    describe("access-cookie authentication", () => {
        it("should attach an authenticated user from the cookie belonging to the supplied user ID", async () => {
            s.handshake.headers.cookie = 'token_alice=' + token();
            await socketAuth(s, next);
            expect(s.user).toMatchObject({ userid: 'alice', username: 'Alice' });
            expect(next).toHaveBeenCalledWith();
        });
        it("should reject a connection when the cookie header or matching access cookie is missing", async () => {
            for (const cookie of [undefined, 'other=token']) {
                s.handshake.headers.cookie = cookie;
                next.mockClear();
                await socketAuth(s, next);
                expect(next).toHaveBeenCalledWith(expect.any(Error));
                expect(s.user).toBeUndefined();
            }
        });
        it("should reject malformed, expired, tampered, or incorrectly signed access tokens", async () => {
            for (const value of ['broken', token({}, { expiresIn: -1 }), token() + 'tampered', jwt.sign({ userid: 'alice' }, 'wrong')]) {
                next.mockClear();
                s.handshake.headers.cookie = 'token_alice=' + value;
                await socketAuth(s, next);
                expect(next).toHaveBeenCalledWith(expect.any(Error));
                expect(s.user).toBeUndefined();
            }
        });
        it("should reject authentication when the signing secret is missing", async () => {
            vi.stubEnv('ACCESS_TOKEN_SECRET', '');
            await socketAuth(s, next);
            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });
    });
    describe("room-token authentication", () => {
        it("should attach the session from a valid room token for an existing player in a started game", async () => {
            s.handshake.auth.roomToken = token({ userid: 'alice', username: 'Alice', roomid: 'r1' });
            await socketAuth(s, next);
            expect(s.session).toMatchObject({ userid: 'alice', roomid: 'r1' });
            expect(h.checkGameStarted).toHaveBeenCalledWith('r1');
            expect(next).toHaveBeenCalledWith();
        });
        it("should reject reconnecting with a room token when the game has not started or the player no longer exists", async () => {
            s.handshake.auth.roomToken = token({ userid: 'alice', roomid: 'r1' });
            for (const fn of [h.checkGameStarted, h.userExist]) {
                fn.mockResolvedValueOnce(false);
                next.mockClear();
                await socketAuth(s, next);
                expect(next).toHaveBeenCalledWith(expect.any(Error));
                expect(s.session).toBeUndefined();
            }
        });
        it("should reject invalid or expired room tokens and unsupported signing algorithms", async () => {
            for (const value of ['broken', token({ roomid: 'r1' }, { expiresIn: -1 }), token({ roomid: 'r1' }, { algorithm: 'HS384' })]) {
                next.mockClear();
                s.handshake.auth.roomToken = value;
                await socketAuth(s, next);
                expect(next).toHaveBeenCalledWith(expect.any(Error));
            }
        });
        it("should reject authentication when the room or player lookup fails", async () => {
            s.handshake.auth.roomToken = token({ userid: 'alice', roomid: 'r1' });
            for (const fn of [h.checkGameStarted, h.userExist]) {
                fn.mockRejectedValueOnce(new Error('offline'));
                next.mockClear();
                await socketAuth(s, next);
                expect(next).toHaveBeenCalledWith(expect.any(Error));
            }
        });
        it("should complete the authentication callback exactly once on success or failure", async () => {
            s.handshake.headers.cookie = 'token_alice=' + token();
            await socketAuth(s, next);
            expect(next).toHaveBeenCalledTimes(1);
            next.mockClear();
            s.handshake.headers.cookie = '';
            await socketAuth(s, next);
            expect(next).toHaveBeenCalledTimes(1);
        });
    });
    describe("Proposed safeguards requiring approval: D1, D5 in TEST_OUTLINES.md", () => {
        it.todo("should normalize and accept a valid auction index including index zero");
        it.todo("should reject missing, nonnumeric, fractional, negative, array-valued, or out-of-range auction indexes for new players");
        it.todo("should reject verified tokens whose required identity or room claims are missing or have invalid types");
        it.todo("should reject an access token whose user ID differs from the supplied handshake user ID");
        it.todo("should reject a room token when the player belongs to a different room");
        it.todo("should prevent a room token from being used as an account access token and vice versa");
    });
});
