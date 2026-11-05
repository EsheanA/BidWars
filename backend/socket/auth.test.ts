import { boundaryIndexes, invalidQueryIndexes } from '../test-support/auctionIndexes';
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
    });
    describe("Auction-index regressions", () => {
        it("should normalize and accept a valid auction index including index zero", async () => {
            for (const index of boundaryIndexes) {
                s.handshake.query.auctionIndex = String(index);
                s.handshake.headers.cookie = 'token_alice=' + token();
                next.mockClear();
                await socketAuth(s, next);
                expect(next).toHaveBeenCalledExactlyOnceWith();
                expect(s.auctionIndex).toBe(index);
            }
        });
        it("should reject missing, nonnumeric, fractional, negative, array-valued, or out-of-range auction indexes for new players", async () => {
            s.handshake.headers.cookie = 'token_alice=' + token();
            for (const value of invalidQueryIndexes) {
                s.handshake.query.auctionIndex = value;
                next.mockClear();
                await socketAuth(s, next);
                expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: expect.stringContaining('Invalid auction index') }));
                expect(s.user).toBeUndefined();
                expect(s.auctionIndex).toBeUndefined();
            }
            expect(h.checkGameStarted).not.toHaveBeenCalled();
            expect(h.userExist).not.toHaveBeenCalled();
        });
    });
});
describe('auction selection during reconnect', () => {
    it('allows an existing session without a new auction selection', async () => {
        s.handshake.auth.roomToken = token({ userid: 'alice', roomid: 'r1' });
        delete s.handshake.query.auctionIndex;
        await socketAuth(s, next);
        expect(next).toHaveBeenCalledExactlyOnceWith();
        expect(s.session.roomid).toBe('r1');
        expect(s.auctionIndex).toBeUndefined();
    });
    it('rejects an explicitly invalid reconnect selection before accessing room storage', async () => {
        s.handshake.auth.roomToken = token({ userid: 'alice', roomid: 'r1' });
        s.handshake.query.auctionIndex = ['0'];
        await socketAuth(s, next);
        expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'InvalidAuctionIndexError' }));
        expect(h.checkGameStarted).not.toHaveBeenCalled();
        expect(h.userExist).not.toHaveBeenCalled();
    });
});
