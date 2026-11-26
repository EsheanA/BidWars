import { constants, createWriteStream } from 'node:fs';
import { access, mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assetPaths } from '../config/assets';

export interface AudioStore {
    readonly directory: string;
    initialize(): Promise<void>;
    save(name: string, audio: Readable, signal: AbortSignal): Promise<void>;
    remove(name: string): Promise<void>;
}

export function audioFilename(value: string): string {
    const match = /^(?:audioFiles\/)?([a-zA-Z0-9_-]+\.mp3)$/.exec(value);
    if (!match) throw new Error('Invalid prepared audio path');
    return match[1]!;
}
const code = (error: unknown) => (error as { code?: string | number })?.code;

export class FileAudioStore implements AudioStore {
    constructor(readonly directory: string, private readonly mounted = false) {}
    async initialize(): Promise<void> {
        // A missing mount must fail, never silently create an ephemeral substitute.
        if (this.mounted) {
            if (!(await stat(this.directory)).isDirectory()) throw new Error('AUDIO_DIRECTORY must be a mounted directory');
        } else await mkdir(this.directory, { recursive: true });
        await access(this.directory, constants.R_OK | constants.W_OK);
    }
    private file(name: string) { return path.join(this.directory, audioFilename(name)); }
    async save(name: string, audio: Readable, signal: AbortSignal): Promise<void> {
        let owned = false;
        try {
            signal.throwIfAborted();
            const destination = this.file(name);
            await this.initialize();
            signal.throwIfAborted();
            const output = createWriteStream(destination, { flags: 'wx' });
            output.once('open', () => { owned = true; });
            await pipeline(audio, output, { signal });
            signal.throwIfAborted();
        } catch (error) {
            audio.destroy();
            if (owned) await this.remove(name);
            throw error;
        }
    }

    async remove(name: string): Promise<void> {
        try { await unlink(this.file(name)); }
        catch (error) { if (code(error) !== 'ENOENT') throw error; }
    }
}

export function createAudioStore(): AudioStore {
    const mode = process.env.AUDIO_STORAGE ?? (process.env.NODE_ENV === 'production' ? '' : 'local');
    if (mode === 'local') return new FileAudioStore(assetPaths().audioDirectory);
    if (mode !== 'mounted') throw new Error('AUDIO_STORAGE must be local or mounted (required in production)');
    const directory = process.env.AUDIO_DIRECTORY;
    if (!directory || !path.isAbsolute(directory)) throw new Error('Mounted audio requires an absolute AUDIO_DIRECTORY');
    return new FileAudioStore(directory, true);
}

let configured: AudioStore | undefined;
export function getAudioStore(): AudioStore { return configured ??= createAudioStore(); }
