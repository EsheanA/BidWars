import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import net from 'node:net';
vi.mock('./routes/userRoutes', async () => ({ default: (await import('express')).Router() }));
vi.mock('./routes/auctionRoutes', async () => ({ default: (await import('express')).Router() }));
import app, { corsOpts } from './app';
function origin(value: string | undefined) {
    return new Promise<boolean>((resolve, reject) => {
        (corsOpts.origin as Function)(value, (err: Error | null, allowed: boolean) => err ? reject(err) : resolve(allowed));
    });
}
describe("application import and shared CORS policy", () => {
    it("should export the configured Express application without opening a listener or connecting to MongoDB or Redis", async () => {
        expect(typeof app).toBe('function');
        expect(mongoose.connect).not.toHaveBeenCalled();
        expect(net.Server.prototype.listen).not.toHaveBeenCalled();
        expect(mongoose.connection.readyState).toBe(0);
    });
    it("should import successfully without database URLs, signing secrets, or AI provider credentials", async () => {
        for (const key of ['REDIS_URL', 'MONGODB_URI', 'ACCESS_TOKEN_SECRET', 'GROK_KEY'])
            vi.stubEnv(key, undefined);
        vi.resetModules();
        expect(typeof (await import('./app.js')).default).toBe('function');
        expect(mongoose.connect).not.toHaveBeenCalled();
    });
    it("should allow requests with no Origin through the shared origin-policy callback", async () => {
        expect(await origin(undefined)).toBe(true);
    });
    it("should allow HTTP and HTTPS localhost origins through the shared origin-policy callback", async () => {
        for (const value of ['http://localhost:5173', 'https://localhost'])
            expect(await origin(value)).toBe(true);
    });
    it("should reject malformed origins, unsupported protocols, and non-localhost origins through the origin-policy callback", async () => {
        for (const value of ['invalid', 'ftp://localhost', 'https://example.com', 'https://localhost.evil.com'])
            await expect(origin(value)).rejects.toThrow('CORS');
    });
});
