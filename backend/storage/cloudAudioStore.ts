import { randomUUID } from 'node:crypto';
import { addAbortSignal, type Readable } from 'node:stream';
import { audioFilename } from './audioFilename';
import type { AudioStore } from './audioStore';

const metadataTokenUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const maxAudioBytes = 8 * 1024 * 1024;
const uploadIdHeader = 'x-goog-meta-bidwars-upload-id';

export class CloudAudioStore implements AudioStore {
    private readonly bucketUrl: string;
    private token: { value: string; refreshAt: number } | undefined;
    private tokenRequest: Promise<string> | undefined;

    constructor(bucket: string) {
        if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) {
            throw new Error('GCS audio requires AUDIO_BUCKET to be a Cloud Storage bucket name');
        }
        this.bucketUrl = `https://storage.googleapis.com/${bucket}`;
    }

    private async loadToken(): Promise<string> {
        const startedAt = Date.now();
        const response = await fetch(metadataTokenUrl, {
            headers: { 'Metadata-Flavor': 'Google' },
            redirect: 'error',
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Cloud Run service identity token request failed (${response.status})`);
        }
        const tokenResponse = await response.json().catch(() => undefined) as { access_token?: unknown; expires_in?: unknown } | undefined;
        const { access_token, expires_in } = tokenResponse ?? {};
        if (typeof access_token !== 'string' || !access_token || typeof expires_in !== 'number' ||
            !Number.isFinite(expires_in) || expires_in <= 0) {
            throw new Error('Cloud Run service identity returned an invalid token response');
        }
        this.token = { value: access_token, refreshAt: startedAt + expires_in * 1000 - 60000 };
        return access_token;
    }

    private async accessToken(): Promise<string> {
        if (this.token && this.token.refreshAt > Date.now()) return this.token.value;
        return this.tokenRequest ??= this.loadToken().finally(() => { this.tokenRequest = undefined; });
    }

    private async request(url: string, options: RequestInit = {}): Promise<Response> {
        options.signal?.throwIfAborted();
        return this.send(url, await this.accessToken(), options);
    }

    private async send(url: string, token: string, options: RequestInit): Promise<Response> {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('Date', new Date().toUTCString());
        const timeout = AbortSignal.timeout(30000);
        const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
        signal.throwIfAborted();
        const response = await fetch(url, { ...options, headers, signal, redirect: 'error' });
        if (response.status === 401 && this.token?.value === token) this.token = undefined;
        return response;
    }

    private objectUrl(name: string) {
        return `${this.bucketUrl}/${audioFilename(name)}`;
    }

    async initialize(): Promise<void> {
        // Storage Object User can list objects without having bucket administration permissions.
        const response = await this.request(`${this.bucketUrl}/?max-keys=1`);
        await response.body?.cancel();
        if (!response.ok) throw new Error(`Cannot access the audio bucket (${response.status})`);
    }

    async save(name: string, audio: Readable, signal: AbortSignal): Promise<void> {
        const chunks: Uint8Array[] = [];
        let length = 0;
        let url: string;
        try {
            signal.throwIfAborted();
            url = this.objectUrl(name);
            for await (const chunk of addAbortSignal(signal, audio)) {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                length += bytes.length;
                if (length > maxAudioBytes) throw new Error('Prepared audio exceeds the 8 MiB upload limit');
                chunks.push(bytes);
            }
            if (!length) throw new Error('Prepared audio is empty');
            signal.throwIfAborted();
        } catch (error) {
            audio.destroy();
            throw error;
        }

        const token = await this.accessToken();
        signal.throwIfAborted();
        const uploadId = randomUUID();
        let response: Response;
        try {
            // Finish a started PUT within its own timeout so cancellation can observe and clean up a commit.
            response = await this.send(url, token, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'audio/mpeg',
                    'Content-Length': String(length),
                    'x-goog-if-generation-match': '0',
                    [uploadIdHeader]: uploadId,
                },
                body: Buffer.concat(chunks, length),
            });
        } catch (error) {
            await this.cleanupUpload(url, uploadId);
            throw error;
        }
        await response.body?.cancel();
        if (response.status >= 500 || (response.ok && signal.aborted)) await this.cleanupUpload(url, uploadId);
        if (!response.ok) throw new Error(`Cloud audio upload failed (${response.status})`);
        signal.throwIfAborted();
    }

    private async cleanupUpload(url: string, uploadId: string): Promise<void> {
        try {
            const response = await this.request(url, { method: 'HEAD' });
            if (response.status === 404) return;
            if (!response.ok) throw new Error('Could not check the attempted upload');
            if (response.headers.get(uploadIdHeader) !== uploadId) return;
            const generation = response.headers.get('x-goog-generation');
            if (!generation) throw new Error('Uploaded audio has no generation');
            await this.deleteObject(url, { 'x-goog-if-generation-match': generation });
        } catch {
            console.warn('Could not remove an unpublished audio object');
        }
    }

    async remove(name: string): Promise<void> {
        await this.deleteObject(this.objectUrl(name));
    }

    private async deleteObject(url: string, headers: HeadersInit = {}): Promise<void> {
        const response = await this.request(url, { method: 'DELETE', headers });
        await response.body?.cancel();
        if (!response.ok && response.status !== 404) throw new Error(`Cloud audio deletion failed (${response.status})`);
    }

    async read(name: string, method: 'GET' | 'HEAD', headers: Headers, signal: AbortSignal): Promise<Response> {
        headers.set('Accept-Encoding', 'identity');
        return this.request(this.objectUrl(name), { method, headers, signal });
    }
}
