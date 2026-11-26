import { Readable, Writable } from 'node:stream';
import type { Request, Response as ExpressResponse } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createAudioStore } from './audioStore';
import { CloudAudioStore } from './cloudAudioStore';
import { serveCloudAudio } from './cloudAudioMiddleware';

const bucket = 'bidwars-test-audio';
const clip = 'Watch_round1.mp3';
const objectUrl = `https://storage.googleapis.com/${bucket}/${clip}`;
const tokenUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

function mockCloud(respond: (url: string, options: RequestInit) => Response | Promise<Response>) {
    return vi.mocked(fetch).mockImplementation(async (input, options = {}) => {
        const url = String(input);
        if (url === tokenUrl) {
            expect(new Headers(options.headers).get('metadata-flavor')).toBe('Google');
            expect(options.redirect).toBe('error');
            return Response.json({ access_token: 'test-token', expires_in: 3600 });
        }
        expect(new Headers(options.headers).get('authorization')).toBe('Bearer test-token');
        expect(options.redirect).toBe('error');
        return respond(url, options);
    });
}

describe('Cloud Storage audio', () => {
    it('requires a bucket name in GCS mode and checks bucket access on startup', async () => {
        vi.stubEnv('AUDIO_STORAGE', 'gcs');
        for (const name of [undefined, 'gs://bidwars-audio', '../bidwars-audio']) {
            vi.stubEnv('AUDIO_BUCKET', name);
            expect(() => createAudioStore()).toThrow('AUDIO_BUCKET');
        }
        expect(fetch).not.toHaveBeenCalled();

        vi.stubEnv('AUDIO_BUCKET', bucket);
        mockCloud(url => {
            expect(url).toBe(`https://storage.googleapis.com/${bucket}/?max-keys=1`);
            return new Response(null, { status: 403 });
        });
        await expect(createAudioStore().initialize()).rejects.toThrow('Cannot access the audio bucket (403)');
    });

    it('uploads the complete clip without overwriting and reuses the identity token for cleanup', async () => {
        const requests = mockCloud((url, options) => {
            expect(url).toBe(objectUrl);
            if (options.method === 'DELETE') return new Response(null, { status: 204 });
            expect(options.method).toBe('PUT');
            expect(Buffer.from(options.body as Buffer).toString()).toBe('0123456789');
            const headers = new Headers(options.headers);
            expect(headers.get('content-length')).toBe('10');
            expect(headers.get('content-type')).toBe('audio/mpeg');
            expect(headers.get('x-goog-if-generation-match')).toBe('0');
            return new Response();
        });
        const store = new CloudAudioStore(bucket);
        await store.save(clip, Readable.from(['01234', '56789']), new AbortController().signal);
        await store.remove(`audioFiles/${clip}`);
        expect(requests.mock.calls.map(([url, options]) => [url, options?.method])).toEqual([
            [tokenUrl, undefined], [objectUrl, 'PUT'], [objectUrl, 'DELETE'],
        ]);
    });

    it('shares a token request across concurrent operations and refreshes it before expiry', async () => {
        const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
        const requests = mockCloud(() => new Response(null, { status: 204 }));
        const store = new CloudAudioStore(bucket);

        await Promise.all([store.remove(clip), store.remove('Coin_round2.mp3')]);
        expect(requests.mock.calls.filter(([url]) => url === tokenUrl)).toHaveLength(1);

        clock.mockReturnValue(1000 + 3541 * 1000);
        await store.remove(clip);
        expect(requests.mock.calls.filter(([url]) => url === tokenUrl)).toHaveLength(2);
    });

    it('rejects incomplete, oversized, and cancelled input without uploading', async () => {
        const store = new CloudAudioStore(bucket);
        const signal = new AbortController().signal;
        const partial = Readable.from((async function* () { yield 'partial'; throw new Error('stream failed'); })());
        await expect(store.save(clip, partial, signal)).rejects.toThrow('stream failed');
        await expect(store.save(clip, Readable.from([Buffer.alloc(8 * 1024 * 1024 + 1)]), signal))
            .rejects.toThrow('upload limit');
        await expect(store.save(clip, Readable.from(['audio']), AbortSignal.abort())).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('deletes the matching generation when cancellation races with a successful upload', async () => {
        const controller = new AbortController();
        let uploadId: string | null = null;
        const requests = mockCloud((_url, options) => {
            const headers = new Headers(options.headers);
            if (options.method === 'PUT') {
                uploadId = headers.get('x-goog-meta-bidwars-upload-id');
                expect(uploadId).toBeTruthy();
                controller.abort();
                expect(options.signal?.aborted).toBe(false);
                return new Response();
            }
            if (options.method === 'HEAD') {
                return new Response(null, {
                    headers: { 'x-goog-meta-bidwars-upload-id': uploadId!, 'x-goog-generation': '42' },
                });
            }
            expect(options.method).toBe('DELETE');
            expect(headers.get('x-goog-if-generation-match')).toBe('42');
            return new Response(null, { status: 204 });
        });
        const store = new CloudAudioStore(bucket);
        await expect(store.save(clip, Readable.from(['mp3']), controller.signal)).rejects.toThrow();
        expect(requests.mock.calls.slice(1).map(([, options]) => options?.method)).toEqual(['PUT', 'HEAD', 'DELETE']);
    });

    it.each([412, 503])('keeps another upload intact when the write fails with %s', async status => {
        const requests = mockCloud((_url, options) => {
            if (options.method === 'PUT') return new Response(null, { status });
            expect(options.method).toBe('HEAD');
            return new Response(null, { headers: { 'x-goog-meta-bidwars-upload-id': 'different-attempt' } });
        });
        const store = new CloudAudioStore(bucket);
        await expect(store.save(clip, Readable.from(['mp3']), new AbortController().signal)).rejects.toThrow(`(${status})`);
        expect(requests.mock.calls.slice(1).map(([, options]) => options?.method)).toEqual(status === 412 ? ['PUT'] : ['PUT', 'HEAD']);
    });
});

async function serve(method: string, path: string, input: Record<string, string> = {}) {
    const outbound = new Headers();
    const chunks: Buffer[] = [];
    const req = { method, path, get: (name: string) => input[name] };
    const res = Object.assign(new Writable({
        write(chunk, _encoding, done) { chunks.push(chunk); done(); },
    }), {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        setHeader(name: string, value: string) { outbound.set(name, value); },
    });
    const next = vi.fn();
    await serveCloudAudio(new CloudAudioStore(bucket))(req as Request, res as unknown as ExpressResponse, next);
    return { status: res.statusCode, headers: outbound, body: Buffer.concat(chunks).toString(), next };
}

describe('serving private bucket audio through BidWars', () => {
    it('returns playback bytes and headers for a browser range request', async () => {
        mockCloud((url, options) => {
            expect(url).toBe(objectUrl);
            expect(options.method).toBe('GET');
            expect(new Headers(options.headers).get('range')).toBe('bytes=2-5');
            return new Response('2345', { status: 206, headers: {
                'content-range': 'bytes 2-5/10', 'content-length': '4', etag: '"the-object"',
                'x-goog-meta-bidwars-upload-id': 'internal-marker',
            } });
        });
        const result = await serve('GET', `/${clip}`, { range: 'bytes=2-5' });
        expect(result).toMatchObject({ status: 206, body: '2345' });
        expect(result.headers.get('content-range')).toBe('bytes 2-5/10');
        expect(result.headers.get('content-type')).toBe('audio/mpeg');
        expect(result.headers.get('cache-control')).toBe('public, max-age=86400, immutable');
        expect(result.headers.get('etag')).toBe('"the-object"');
        expect(result.headers.has('x-goog-meta-bidwars-upload-id')).toBe(false);
    });

    it.each([
        { method: 'HEAD', status: 200, etag: undefined },
        { method: 'GET', status: 304, etag: '"the-object"' },
    ])('preserves bodyless $method $status responses', async ({ method, status, etag }) => {
        mockCloud((_url, options) => {
            expect(options.method).toBe(method);
            expect(new Headers(options.headers).get('if-none-match')).toBe(etag ?? null);
            return new Response(null, { status, headers: { etag: '"the-object"', 'content-length': '10' } });
        });
        const result = await serve(method, `/${clip}`, etag ? { 'if-none-match': etag } : {});
        expect(result).toMatchObject({ status, body: '' });
        expect(result.headers.get('etag')).toBe('"the-object"');
        expect(result.headers.get('content-length')).toBe(status === 200 ? '10' : null);
    });

    it('skips unrecognized paths before contacting the bucket', async () => {
        const result = await serve('GET', '/%2e%2e/private.mp3');
        expect(result.next).toHaveBeenCalledOnce();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([404, 403])('handles a %s from storage without forwarding the provider body', async status => {
        mockCloud(() => new Response('private provider details', { status }));
        const result = await serve('GET', `/${clip}`);
        expect(result.body).toBe('');
        if (status === 404) expect(result.next).toHaveBeenCalledOnce();
        else expect(result.status).toBe(502);
        expect(result.headers.has('cache-control')).toBe(false);
    });
});
