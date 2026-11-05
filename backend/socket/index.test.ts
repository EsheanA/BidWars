import { boundaryIndexes, invalidInternalIndexes } from '../test-support/auctionIndexes';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { room, item, user, socket, socketServer } from '../test-support/fixtures';
vi.mock('../RedisRooms/RoomHandler', () => ({ default: {
        initClient: vi.fn(), getPreGameData: vi.fn(), startGame: vi.fn(), toggleUsersActiveStatus: vi.fn(), handleBid: vi.fn(), distributeItemDB: vi.fn(), logItem: vi.fn(), setItem: vi.fn(), getUser: vi.fn(), toggleSingleUserActiveStatus: vi.fn(), findRoom: vi.fn(), getUsers: vi.fn(), checkWhetherFull: vi.fn(), checkGameStarted: vi.fn(), kickUser: vi.fn(), deleteRoom: vi.fn(), userExist: vi.fn()
    } }));
import handler from '../RedisRooms/RoomHandler';
const h = vi.mocked(handler);
vi.mock('socket.io', () => ({ Server: vi.fn() }));
vi.mock('./auth', () => ({ socketAuth: vi.fn() }));
vi.mock('./GameLogic', () => ({ handleGameLogic: vi.fn() }));
vi.mock('../tokenHandling/generateToken', () => ({ generateRoomAccessToken: vi.fn(() => 'room-token') }));
import { Server } from 'socket.io';
import { initSocket } from './index';
import { socketAuth } from './auth';
import { handleGameLogic } from './GameLogic';
let f: ReturnType<typeof socketServer>, connected: Function;
const http = {} as any, cors = { credentials: true };
beforeEach(async () => {
    vi.clearAllMocks();
    f = socketServer();
    vi.mocked(Server).mockImplementation(function () {
        return f.io as any;
    });
    h.initClient.mockResolvedValue();
    h.getUser.mockResolvedValue(user());
    h.findRoom.mockResolvedValue('r1');
    h.getUsers.mockResolvedValue(room().users);
    h.checkWhetherFull.mockResolvedValue(false);
    h.checkGameStarted.mockResolvedValue(false);
    await initSocket(http, cors);
    connected = f.io.on.mock.calls[0]![1] as Function;
});
const join = () => connected(f.s);
const leave = () => f.s.handlers.get('disconnect')!();
describe("initSocket and connection lifecycle", () => {
    describe("socket initialization", () => {
        it("should return a socket server using the supplied HTTP server and shared CORS settings", async () => {
            const result = await initSocket(http, cors);
            expect(result).toBe(f.io);
            expect(Server).toHaveBeenCalledWith(http, expect.objectContaining({ cors }));
        });
        it("should authenticate new and recovered connections before accepting them", async () => {
            expect(f.io.use).toHaveBeenCalledWith(socketAuth);
            expect(Server).toHaveBeenCalledWith(http, expect.objectContaining({ connectionStateRecovery: expect.objectContaining({ skipMiddlewares: false }) }));
        });
        it("should reject initialization if room storage cannot connect", async () => {
            h.initClient.mockRejectedValueOnce(new Error('offline'));
            await expect(initSocket(http, cors)).rejects.toThrow('offline');
            expect(Server).toHaveBeenCalledTimes(1);
        });
    });
    describe("new players and reconnecting players", () => {
        it("should find a room for an authenticated new player and join that socket to the room", async () => {
            await join();
            expect(h.findRoom).toHaveBeenCalledWith('alice', 'Alice', 1);
            expect(f.s.join).toHaveBeenCalledWith('r1');
        });
        it("should send the new room token only to the joining socket", async () => {
            await join();
            expect(f.io.events.filter(e => e.event === 'room token')).toEqual([{ room: 's1', event: 'room token', data: { roomToken: 'room-token' } }]);
        });
        it("should broadcast the room's updated player list to that room", async () => {
            await join();
            expect(f.io.events).toContainEqual({ room: 'r1', event: 'user list', data: { userlist: room().users } });
        });
        it("should start the game when the room becomes full and keep waiting while it has capacity", async () => {
            await join();
            expect(handleGameLogic).not.toHaveBeenCalled();
            h.checkWhetherFull.mockResolvedValue(true);
            await connected(socket('new'));
            expect(handleGameLogic).toHaveBeenCalledWith(f.io, 'r1');
        });
        it("should reconnect a valid existing session to its original room without matchmaking or issuing a new token", async () => {
            f.s.session = { userid: 'alice', roomid: 'r1' };
            await join();
            expect(f.s.join).toHaveBeenCalledWith('r1');
            expect(h.findRoom).not.toHaveBeenCalled();
            expect(f.io.events.filter(e => e.event === 'room token')).toEqual([]);
            expect(h.toggleSingleUserActiveStatus).toHaveBeenCalledWith('alice');
        });
        it("should report a join failure when identity is missing or matchmaking fails", async () => {
            h.findRoom.mockRejectedValueOnce(new Error('offline'));
            await join();
            expect(f.s.emit).toHaveBeenCalledWith('error message', expect.any(String));
            const s = socket('invalid');
            s.user = undefined as any;
            await connected(s);
            expect(s.emit).toHaveBeenCalledWith('error message', expect.any(String));
        });
    });
    describe("disconnects", () => {
        it("should skip room cleanup when the socket never acquired a user and room", async () => {
            f.s.user = undefined as any;
            await join();
            await leave();
            expect(h.kickUser).not.toHaveBeenCalled();
            expect(h.deleteRoom).not.toHaveBeenCalled();
        });
        it("should remove a player who disconnects before the game starts", async () => {
            await join();
            await leave();
            expect(h.kickUser).toHaveBeenCalledWith('alice', 'r1');
        });
        it("should retain a disconnected player's game membership after the game starts", async () => {
            await join();
            h.checkGameStarted.mockResolvedValue(true);
            await leave();
            expect(h.kickUser).not.toHaveBeenCalled();
            expect(h.toggleSingleUserActiveStatus).toHaveBeenCalledWith('alice');
        });
        it("should delete a room when its final participant is removed", async () => {
            await join();
            h.getUsers.mockResolvedValue([]);
            await leave();
            expect(h.deleteRoom).toHaveBeenCalledWith('r1');
        });
        it("should broadcast the remaining player list when a room still has participants", async () => {
            await join();
            f.io.events.length = 0;
            await leave();
            expect(f.io.events).toEqual([{ room: 'r1', event: 'user list', data: { userlist: room().users } }]);
        });
        it("should handle a failed disconnect cleanup without an unhandled rejection", async () => {
            await join();
            h.kickUser.mockRejectedValueOnce(new Error('offline'));
            await expect(leave()).resolves.toBeUndefined();
            expect(h.deleteRoom).not.toHaveBeenCalled();
        });
    });
    describe("Auction-index regressions", () => {
        it("should accept auction index zero consistently with the other valid auction indexes", async () => {
            for (const index of boundaryIndexes) {
                f.s.auctionIndex = index;
                await join();
                expect(h.findRoom).toHaveBeenLastCalledWith('alice', 'Alice', index);
                expect(f.s.join).toHaveBeenCalledWith('r1');
            }
            expect(f.s.emit).not.toHaveBeenCalled();
        });
    });
});
it('rejects invalid internal selections before matchmaking or joining', async () => {
    for (const value of invalidInternalIndexes) {
        f.s.auctionIndex = value as number;
        await join();
        expect(f.s.emit).toHaveBeenLastCalledWith('error message', expect.stringContaining('Invalid auction index'));
    }
    expect(h.findRoom).not.toHaveBeenCalled();
    expect(f.s.join).not.toHaveBeenCalled();
    expect(h.getUsers).not.toHaveBeenCalled();
    expect(handleGameLogic).not.toHaveBeenCalled();
});
