import { describe, expect, it, vi } from 'vitest';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import { createCorsOptions } from './cors';

function origin(options: CorsOptions, value: string | undefined) {
    return new Promise<boolean>((resolve, reject) => {
        (options.origin as Function)(value, (error: Error | null, allowed: boolean) => error ? reject(error) : resolve(allowed));
    });
}
function production(allowed: string | undefined) {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ALLOWED_ORIGINS', allowed);
    return createCorsOptions();
}

describe('configured frontend origins', () => {
    it('preserves localhost development and originless clients while rejecting remote sites by default', async () => {
        const options = createCorsOptions();
        for (const value of [undefined, 'http://localhost:5173', 'https://localhost']) {
            expect(await origin(options, value)).toBe(true);
        }
        await expect(origin(options, 'https://app.bidwars.example')).rejects.toThrow('CORS');
    });

    it('accepts each configured production origin, normalizing whitespace and root trailing slashes', async () => {
        const options = production(' https://app.bidwars.example/, https://preview.bidwars.example ');
        expect(await origin(options, 'https://app.bidwars.example')).toBe(true);
        expect(await origin(options, 'https://preview.bidwars.example')).toBe(true);
        expect(await origin(options, undefined)).toBe(true);
    });

    it('requires an exact origin match, including protocol, host and port, in production', async () => {
        const options = production('https://app.bidwars.example');
        for (const value of ['http://app.bidwars.example', 'https://app.bidwars.example:8443',
            'https://app.bidwars.example.evil.example', 'https://other.bidwars.example', 'http://localhost:5173']) {
            await expect(origin(options, value)).rejects.toThrow('CORS');
        }
    });

    it('allows localhost in production only when explicitly configured', async () => {
        expect(await origin(production('http://localhost:5173'), 'http://localhost:5173')).toBe(true);
    });

    it('rejects malformed Origin headers even when they contain an allowed host', async () => {
        const options = production('https://app.bidwars.example');
        for (const value of ['', 'null', 'invalid', 'https://app.bidwars.example/path',
            'https://user:password@app.bidwars.example', 'ftp://app.bidwars.example']) {
            await expect(origin(options, value)).rejects.toThrow('CORS');
        }
    });

    it('fails configuration for a missing production list or invalid entries', () => {
        for (const value of [undefined, '', '  ', '*', 'https://*.bidwars.example', 'not-a-url',
            'ftp://app.bidwars.example', 'https://app.bidwars.example/path',
            'https://app.bidwars.example?query=1', 'https://user:password@app.bidwars.example']) {
            expect(() => production(value)).toThrow('CORS_ALLOWED_ORIGINS');
        }
    });

    it('returns credentialed preflight headers for allowed frontends and rejects denied preflights', () => {
        const policy = cors(production('https://app.bidwars.example'));
        function preflight(frontend: string) {
            const headers = new Map<string, unknown>();
            const response = {
                statusCode: 0,
                setHeader: (name: string, value: unknown) => headers.set(name.toLowerCase(), value),
                getHeader: (name: string) => headers.get(name.toLowerCase()),
                end: vi.fn()
            };
            const next = vi.fn();
            policy({ method: 'OPTIONS', headers: { origin: frontend, 'access-control-request-method': 'POST' } } as any, response as any, next);
            return { response, headers, next };
        }
        const allowed = preflight('https://app.bidwars.example');
        expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.bidwars.example');
        expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
        expect(allowed.headers.get('access-control-allow-headers')).toBe('Content-Type,Authorization');
        expect(allowed.headers.get('vary')).toContain('Origin');
        expect(allowed.response.statusCode).toBe(204);
        expect(allowed.response.end).toHaveBeenCalledOnce();
        const denied = preflight('https://evil.example');
        expect(denied.next).toHaveBeenCalledWith(expect.any(Error));
        expect(denied.headers.has('access-control-allow-origin')).toBe(false);
        expect(denied.response.end).not.toHaveBeenCalled();
    });
});
