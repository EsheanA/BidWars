import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { deferred } from '../test-support/fixtures';
const deps = vi.hoisted(() => ({ mkdir: vi.fn(), stat: vi.fn(), access: vi.fn(), unlink: vi.fn(), write: vi.fn() }));
vi.mock('node:fs', async original => ({ ...await original<object>(), createWriteStream: deps.write }));
vi.mock('node:fs/promises', () => ({ mkdir: deps.mkdir, stat: deps.stat, access: deps.access, unlink: deps.unlink }));
import { createAudioStore, FileAudioStore } from './audioStore';

beforeEach(() => {
    vi.clearAllMocks();
    deps.mkdir.mockResolvedValue(undefined);
    deps.access.mockResolvedValue(undefined);
    deps.stat.mockResolvedValue({ isDirectory: () => true });
    deps.unlink.mockResolvedValue(undefined);
    deps.write.mockImplementation(() => {
        const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
        queueMicrotask(() => output.emit('open', 123));
        return output;
    });
});

describe('audio storage', () => {
    it('uses the same configured directory for creation and cleanup, independent of working directory', async () => {
        const store = new FileAudioStore('/data/audio');
        await store.save('Watch_123.mp3', Readable.from(['MP3 bytes']), new AbortController().signal);
        await store.remove('audioFiles/Watch_123.mp3');
        expect(deps.mkdir).toHaveBeenCalledWith('/data/audio', { recursive: true });
        expect(deps.write).toHaveBeenCalledWith('/data/audio/Watch_123.mp3', { flags: 'wx' });
        expect(deps.unlink).toHaveBeenCalledWith('/data/audio/Watch_123.mp3');
    });

    it('does not publish completion until the file has closed and persisted', async () => {
        const closing = deferred<void>();
        deps.write.mockImplementationOnce(() => {
            const output = new Writable({
                write(_chunk, _encoding, callback) { callback(); },
                destroy(error, callback) { void closing.promise.then(() => callback(error)); }
            });
            queueMicrotask(() => output.emit('open', 123));
            return output;
        });
        let ready = false;
        const saved = new FileAudioStore('/data').save('Watch_123.mp3', Readable.from(['mp3']), new AbortController().signal).then(() => { ready = true; });
        await vi.waitFor(() => expect(deps.write).toHaveBeenCalled());
        expect(ready).toBe(false);
        closing.resolve(); await saved;
        expect(ready).toBe(true);
    });

    it.each(['stream failure', 'cancellation'])('deletes its partial file after %s', async reason => {
        const input = new Readable({ read() {} });
        const controller = new AbortController();
        const store = new FileAudioStore('/data/audio');
        const rejected = expect(store.save('Watch_123.mp3', input, controller.signal)).rejects.toBeTruthy();
        await vi.waitFor(() => expect(deps.write).toHaveBeenCalled());
        if (reason === 'stream failure') input.destroy(new Error('speech disconnected'));
        else controller.abort();
        await rejected;
        expect(deps.unlink).toHaveBeenCalledWith('/data/audio/Watch_123.mp3');
    });

    it('preserves an existing file if exclusive creation fails', async () => {
        deps.write.mockImplementationOnce(() => {
            const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
            queueMicrotask(() => output.destroy(Object.assign(new Error('exists'), { code: 'EEXIST' })));
            return output;
        });
        await expect(new FileAudioStore('/data').save('Watch_123.mp3', Readable.from(['mp3']), new AbortController().signal)).rejects.toMatchObject({ code: 'EEXIST' });
        expect(deps.unlink).not.toHaveBeenCalled();
    });

    it('tolerates repeated cleanup but reports permission failures and rejects traversal', async () => {
        const store = new FileAudioStore('/data');
        deps.unlink.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        await expect(store.remove('Watch_123.mp3')).resolves.toBeUndefined();
        deps.unlink.mockRejectedValueOnce(new Error('permission denied'));
        await expect(store.remove('Watch_123.mp3')).rejects.toThrow('permission denied');
        deps.unlink.mockClear();
        await expect(store.remove('../private.mp3')).rejects.toThrow('Invalid prepared audio path');
        expect(deps.unlink).not.toHaveBeenCalled();
    });

    it('validates the mounted bucket directory without creating a local substitute', async () => {
        vi.stubEnv('AUDIO_STORAGE', 'mounted');
        vi.stubEnv('AUDIO_DIRECTORY', '/mnt/bidwars-audio');
        const store = createAudioStore();
        await store.initialize();
        expect(store).toMatchObject({ directory: '/mnt/bidwars-audio' });
        expect(deps.stat).toHaveBeenCalledWith('/mnt/bidwars-audio');
        expect(deps.access).toHaveBeenCalled();
        expect(deps.mkdir).not.toHaveBeenCalled();
        await store.save('Watch_123.mp3', Readable.from(['mp3']), new AbortController().signal);
        await store.remove('audioFiles/Watch_123.mp3');
        expect(deps.write).toHaveBeenCalledWith('/mnt/bidwars-audio/Watch_123.mp3', { flags: 'wx' });
        expect(deps.unlink).toHaveBeenCalledWith('/mnt/bidwars-audio/Watch_123.mp3');
        deps.stat.mockRejectedValueOnce(new Error('mount missing'));
        await expect(store.initialize()).rejects.toThrow('mount missing');
        deps.stat.mockResolvedValueOnce({ isDirectory: () => false });
        await expect(store.initialize()).rejects.toThrow('mounted directory');
        deps.access.mockRejectedValueOnce(new Error('read-only mount'));
        await expect(store.initialize()).rejects.toThrow('read-only mount');
        expect(deps.mkdir).not.toHaveBeenCalled();
    });

    it('requires explicit production storage and an absolute path for mounted storage', () => {
        vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AUDIO_STORAGE', undefined);
        expect(() => createAudioStore()).toThrow('AUDIO_STORAGE');
        vi.stubEnv('AUDIO_STORAGE', 'mounted'); vi.stubEnv('AUDIO_DIRECTORY', undefined);
        expect(() => createAudioStore()).toThrow('absolute AUDIO_DIRECTORY');
        vi.stubEnv('AUDIO_DIRECTORY', 'relative');
        expect(() => createAudioStore()).toThrow('absolute AUDIO_DIRECTORY');
    });
});
