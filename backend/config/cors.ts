import type { CorsOptions } from 'cors';

function parseOrigin(value: string): URL {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) {
        throw new Error('Expected an HTTP(S) origin without a path, credentials or wildcard');
    }
    return url;
}

export function createCorsOptions(): CorsOptions {
    const production = process.env.NODE_ENV === 'production';
    const entries = (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
    const allowed = new Set<string>();
    for (const entry of entries) {
        try {
            allowed.add(parseOrigin(entry).origin);
        } catch {
            throw new Error('CORS_ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins');
        }
    }
    if (production && allowed.size === 0) {
        throw new Error('CORS_ALLOWED_ORIGINS is required in production');
    }
    return {
        origin(origin, callback) {
            // CLI clients and health probes may legitimately omit Origin.
            if (origin === undefined) { callback(null, true); return; }
            try {
                const url = parseOrigin(origin);
                if (origin === url.origin && (allowed.has(origin) || (!production && url.hostname === 'localhost'))) {
                    callback(null, true);
                    return;
                }
            } catch { /* Reject malformed Origin headers below. */ }
            callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 204
    };
}
