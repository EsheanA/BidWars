import { beforeEach, afterEach, vi } from 'vitest';
import net from 'node:net';
import mongoose from 'mongoose';
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('dotenv/config', () => ({}));
function isolateServices() {
    const forbidden = () => {
        throw new Error('Live service access is forbidden in unit tests');
    };
    vi.spyOn(net.Server.prototype, 'listen').mockImplementation(forbidden);
    vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(forbidden);
    vi.spyOn(mongoose, 'connect').mockImplementation(forbidden);
    vi.spyOn(mongoose.Query.prototype, 'exec').mockImplementation(forbidden);
    vi.spyOn(mongoose.Model.prototype, 'save').mockImplementation(forbidden);
    vi.stubGlobal('fetch', vi.fn(forbidden));
    for (const key of ['MONGODB_URI', 'REDIS_URL', 'GROK_KEY', 'LEMON_FOX_KEY', 'ACCESS_TOKEN_SECRET'])
        vi.stubEnv(key, 'unit-test-only');
    vi.spyOn(console, 'log').mockImplementation(() => {
    });
    vi.spyOn(console, 'error').mockImplementation(() => {
    });
}
// Protect module evaluation as well as test bodies.
isolateServices();
beforeEach(isolateServices);
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});
