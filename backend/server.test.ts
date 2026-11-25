import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { deferred } from './test-support/fixtures';

const deps = vi.hoisted(() => ({
    listen: vi.fn(), close: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
    init: vi.fn(), closeSocket: vi.fn(), closeRedis: vi.fn(), app: vi.fn(), cors: { credentials: true }
}));
vi.mock('http', () => ({ default: { createServer: vi.fn() } }));
vi.mock('mongoose', () => ({ default: { connect: deps.connect, disconnect: deps.disconnect } }));
vi.mock('./socket/index', () => ({ initSocket: deps.init, closeSocket: deps.closeSocket }));
vi.mock('./RedisRooms/RoomHandler', () => ({ default: { closeClient: deps.closeRedis } }));
vi.mock('./app', () => ({ default: deps.app, corsOpts: deps.cors }));
import http from 'http';

let server: EventEmitter & { listening: boolean; listen: typeof deps.listen; close: typeof deps.close };
let signals: Map<string, () => void>;
let previousExitCode: typeof process.exitCode;
const io = {};
const flush = () => vi.advanceTimersByTimeAsync(0);
async function start() { await import('./server.js'); await flush(); }

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const dependency of Object.values(deps)) {
        if (vi.isMockFunction(dependency)) dependency.mockReset();
    }
    vi.useFakeTimers();
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.stubEnv('PORT', undefined);
    server = Object.assign(new EventEmitter(), { listening: false, listen: deps.listen, close: deps.close });
    vi.mocked(http.createServer).mockReturnValue(server as any);
    deps.listen.mockImplementation((_port, _host, callback) => { server.listening = true; callback(); return server; });
    deps.close.mockImplementation(callback => { server.listening = false; callback(); });
    deps.connect.mockResolvedValue({});
    deps.init.mockResolvedValue(io);
    deps.closeSocket.mockResolvedValue(undefined);
    deps.closeRedis.mockResolvedValue(undefined);
    deps.disconnect.mockResolvedValue(undefined);
    signals = new Map();
    const on = process.on.bind(process), off = process.off.bind(process);
    vi.spyOn(process, 'on').mockImplementation(((event: string, listener: () => void) => {
        if (event === 'SIGTERM' || event === 'SIGINT') { signals.set(event, listener); return process; }
        return on(event as any, listener);
    }) as typeof process.on);
    vi.spyOn(process, 'off').mockImplementation(((event: string, listener: () => void) => {
        if (event === 'SIGTERM' || event === 'SIGINT') { signals.delete(event); return process; }
        return off(event as any, listener);
    }) as typeof process.off);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});
afterEach(() => { process.exitCode = previousExitCode; });

describe('server startup', () => {
    it.each([undefined, '8080'])('binds to all interfaces using PORT=%s or the local default', async port => {
        vi.stubEnv('PORT', port);
        await start();
        expect(deps.listen).toHaveBeenCalledWith(port ? 8080 : 3000, '0.0.0.0', expect.any(Function));
        expect(deps.init).toHaveBeenCalledExactlyOnceWith(server, deps.cors);
        expect(deps.connect).toHaveBeenCalledExactlyOnceWith('unit-test-only');
        expect(deps.connect.mock.invocationCallOrder[0]).toBeLessThan(deps.init.mock.invocationCallOrder[0]!);
        expect(deps.init.mock.invocationCallOrder[0]).toBeLessThan(deps.listen.mock.invocationCallOrder[0]!);
    });

    it('accepts no traffic until both MongoDB and Redis/socket initialization finish', async () => {
        const mongo = deferred<void>(), sockets = deferred<any>();
        deps.connect.mockReturnValueOnce(mongo.promise);
        deps.init.mockReturnValueOnce(sockets.promise);
        await start();
        expect(deps.init).not.toHaveBeenCalled();
        expect(deps.listen).not.toHaveBeenCalled();
        mongo.resolve(); await flush();
        expect(deps.init).toHaveBeenCalledOnce();
        expect(deps.listen).not.toHaveBeenCalled();
        sockets.resolve(io); await flush();
        expect(deps.listen).toHaveBeenCalledOnce();
    });

    it.each(['', '0', '-1', '3.5', 'abc', '65536'])('rejects invalid PORT=%s before connecting', async port => {
        vi.stubEnv('PORT', port);
        await start();
        expect(deps.connect).not.toHaveBeenCalled();
        expect(deps.listen).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
        expect(console.error).toHaveBeenCalledWith('Failed to start server:', expect.objectContaining({ message: expect.stringContaining('PORT') }));
    });

    it('fails a missing MongoDB URI before opening any connections', async () => {
        vi.stubEnv('MONGODB_URI', '');
        await start();
        expect(deps.connect).not.toHaveBeenCalled();
        expect(deps.init).not.toHaveBeenCalled();
        expect(deps.listen).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
    });

    it.each(['MongoDB', 'Redis', 'listener'])('fails startup and cleans up after a %s failure', async failure => {
        const error = new Error('offline');
        if (failure === 'MongoDB') deps.connect.mockRejectedValueOnce(error);
        if (failure === 'Redis') deps.init.mockRejectedValueOnce(error);
        if (failure === 'listener') deps.listen.mockImplementationOnce(() => server.emit('error', error));
        await start();
        expect(process.exitCode).toBe(1);
        expect(deps.listen).toHaveBeenCalledTimes(failure === 'listener' ? 1 : 0);
        expect(deps.closeSocket).toHaveBeenCalledTimes(failure === 'listener' ? 1 : 0);
        expect(deps.closeRedis).toHaveBeenCalled();
        expect(deps.disconnect).toHaveBeenCalledOnce();
        expect(console.error).toHaveBeenCalledWith('Failed to start server:', error);
        expect(signals.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('server shutdown', () => {
    it.each(['SIGTERM', 'SIGINT'])('drains sockets and games before closing databases on %s, only once', async signal => {
        await start();
        const closed = deferred<void>();
        deps.closeSocket.mockReturnValueOnce(closed.promise);
        const stop = signals.get(signal)!;
        stop(); stop();
        await flush();
        expect(deps.closeSocket).toHaveBeenCalledExactlyOnceWith(io);
        expect(deps.closeRedis).not.toHaveBeenCalled();
        expect(deps.disconnect).not.toHaveBeenCalled();
        closed.resolve(); await flush();
        expect(deps.closeRedis).toHaveBeenCalledExactlyOnceWith();
        expect(deps.disconnect).toHaveBeenCalledOnce();
        expect(process.exitCode).toBeUndefined();
        expect(signals.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['MongoDB', 'Redis'])('never opens a listener when shutdown interrupts %s startup', async stage => {
        const connection = deferred<any>();
        (stage === 'MongoDB' ? deps.connect : deps.init).mockReturnValueOnce(connection.promise);
        await start();
        signals.get('SIGTERM')!();
        await flush();
        expect(deps.closeRedis).toHaveBeenCalledWith(true);
        connection.resolve(io); await flush();
        expect(deps.listen).not.toHaveBeenCalled();
        expect(deps.disconnect).toHaveBeenCalledOnce();
        expect(process.exitCode).toBeUndefined();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('still attempts both database closes when a socket close or Redis close fails', async () => {
        await start();
        deps.closeSocket.mockRejectedValueOnce(new Error('socket close failed'));
        deps.closeRedis.mockRejectedValueOnce(new Error('Redis close failed'));
        signals.get('SIGTERM')!(); await flush();
        expect(deps.closeRedis).toHaveBeenCalledOnce();
        expect(deps.disconnect).toHaveBeenCalledOnce();
        expect(process.exitCode).toBe(1);
        expect(process.exit).toHaveBeenCalledWith(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('exits unsuccessfully if shutdown exceeds eight seconds', async () => {
        await start();
        const stuck = deferred<void>();
        deps.closeSocket.mockReturnValueOnce(stuck.promise);
        signals.get('SIGTERM')!(); await flush();
        await vi.advanceTimersByTimeAsync(7999);
        expect(process.exit).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
        stuck.resolve(); await flush();
    });
});
