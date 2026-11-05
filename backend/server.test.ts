import { describe, it, expect, vi, beforeEach } from 'vitest';
const deps = vi.hoisted(() => ({
    listen: vi.fn(), connect: vi.fn(), init: vi.fn(), app: vi.fn(), cors: { credentials: true }
}));
vi.mock('http', () => ({ default: { createServer: vi.fn(() => ({ listen: deps.listen })) } }));
vi.mock('mongoose', () => ({ default: { connect: deps.connect } }));
vi.mock('./socket/index', () => ({ initSocket: deps.init }));
vi.mock('./app', () => ({ default: deps.app, corsOpts: deps.cors }));
beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    deps.connect.mockResolvedValue({});
    deps.init.mockResolvedValue({});
});
async function start() {
    await import('./server.js');
    await new Promise(resolve => queueMicrotask(() => queueMicrotask(resolve as () => void)));
}
describe("server startup", () => {
    it("should connect using MONGODB_URI before beginning to listen", async () => {
        let release!: () => void;
        deps.connect.mockReturnValueOnce(new Promise<void>(r => {
            release = r;
        }));
        await start();
        expect(deps.connect).toHaveBeenCalledWith('unit-test-only');
        expect(deps.listen).not.toHaveBeenCalled();
        release();
        await Promise.resolve();
        expect(deps.listen).toHaveBeenCalledOnce();
    });
    it("should start the supplied application on port 3000 after MongoDB connects", async () => {
        await start();
        expect(deps.listen).toHaveBeenCalledWith(3000, expect.any(Function));
        expect(deps.connect.mock.invocationCallOrder[0]).toBeLessThan(deps.listen.mock.invocationCallOrder[0]!);
    });
    it("should attach socket handling to the same HTTP server with the application's shared CORS settings", async () => {
        await start();
        expect(deps.init).toHaveBeenCalledWith(expect.objectContaining({ listen: deps.listen }), deps.cors);
    });
    it("should report a missing MongoDB URI without attempting a connection or opening a listener", async () => {
        vi.stubEnv('MONGODB_URI', '');
        await start();
        expect(deps.connect).not.toHaveBeenCalled();
        expect(deps.listen).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith('Failed to start server:', expect.any(Error));
    });
    it("should report a rejected MongoDB connection without opening a listener or initializing sockets", async () => {
        deps.connect.mockRejectedValueOnce(new Error('offline'));
        await start();
        expect(deps.listen).not.toHaveBeenCalled();
        expect(deps.init).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith('Failed to start server:', expect.objectContaining({ message: 'offline' }));
    });
});
