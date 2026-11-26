import type { RequestHandler } from 'express';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import type { CloudAudioStore } from './cloudAudioStore';

export function serveCloudAudio(store: CloudAudioStore): RequestHandler {
    return async (req, res, next) => {
        const method = req.method;
        const name = /^\/([a-zA-Z0-9_-]+\.mp3)$/.exec(req.path)?.[1];
        if (!name || (method !== 'GET' && method !== 'HEAD')) { next(); return; }

        const headers = new Headers();
        for (const name of ['if-none-match', 'if-modified-since']) {
            const value = req.get(name);
            if (value) headers.set(name, value);
        }
        const range = req.get('range');
        // Serve a full response for If-Range or unsupported multipart ranges.
        if (method === 'GET' && range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range) && !req.get('if-range')) {
            headers.set('range', range);
        }

        const abort = new AbortController();
        const disconnected = () => abort.abort();
        res.once('close', disconnected);
        try {
            const response = await store.read(name, method, headers, abort.signal);
            if (response.status === 404) {
                await response.body?.cancel();
                next();
                return;
            }
            if (response.status === 416) {
                await response.body?.cancel();
                const contentRange = response.headers.get('content-range');
                if (contentRange) res.setHeader('Content-Range', contentRange);
                res.status(416).end();
                return;
            }
            if (!response.ok && response.status !== 304) {
                await response.body?.cancel();
                throw new Error(`Cloud audio read failed (${response.status})`);
            }
            res.status(response.status);
            res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
            res.setHeader('Accept-Ranges', 'bytes');
            for (const name of ['etag', 'last-modified', 'content-range']) {
                const value = response.headers.get(name);
                if (value) res.setHeader(name, value);
            }
            if (response.status !== 304) {
                res.setHeader('Content-Type', 'audio/mpeg');
                const length = response.headers.get('content-length');
                if (length) res.setHeader('Content-Length', length);
            }
            if (!response.body) res.end();
            else await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), res);
        } catch (error) {
            if (abort.signal.aborted || res.destroyed) return;
            if (res.headersSent) res.destroy();
            else {
                console.error('Cloud audio unavailable:', error instanceof Error ? error.name : 'UnknownError');
                res.status(502).end();
            }
        } finally {
            res.off('close', disconnected);
        }
    };
}
