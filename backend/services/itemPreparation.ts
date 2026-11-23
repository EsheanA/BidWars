import type { GrokItemResponse } from '../types/Auction';
import { timingLog, type TimingContext } from '../logging/roundTiming';
import { InvalidAuctionIndexError } from '../auctions/auctionIndex';

export type ItemDraft = Omit<GrokItemResponse, 'audio_url'>;
export interface PreparationSource {
    generateDraft(index: number, signal?: AbortSignal): Promise<ItemDraft>;
    generateAudio(draft: ItemDraft, signal?: AbortSignal): Promise<string>;
    discardAudio(path: string): Promise<void>;
}

function retrySettings(): { initial: number; cap: number } {
    const positive = (value: string | undefined, fallback: number) => {
        const number = Number(value);
        return Number.isSafeInteger(number) && number > 0 ? number : fallback;
    };
    const cap = positive(process.env.ITEM_PREPARATION_RETRY_CAP_MS, 10000);
    return { initial: Math.min(positive(process.env.ITEM_PREPARATION_RETRY_MS, 1000), cap), cap };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const aborted = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', aborted);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', aborted);
            resolve();
        }, ms);
        signal.addEventListener('abort', aborted, { once: true });
    });
}

// Each stage owns its retry loop: a speech failure keeps the successful draft.
export async function prepareMedia(
    source: PreparationSource, context: TimingContext, signal: AbortSignal,
    beforeAttempt: () => Promise<number>
): Promise<GrokItemResponse> {
    const started = performance.now();
    const { initial, cap } = retrySettings();
    timingLog('item.preparation.started', context);
    async function stage<T>(name: string, work: (index: number) => Promise<T>): Promise<T> {
        let attempt = 0;
        let retryDelayMs = initial;
        while (true) {
            signal.throwIfAborted();
            const start = performance.now();
            attempt++;
            timingLog('item.preparation.attempt', context, { stage: name, attempt });
            try {
                const index = await beforeAttempt();
                signal.throwIfAborted();
                const result = await work(index);
                timingLog('item.preparation.stage.completed', context, { stage: name, attempt, durationMs: performance.now() - start });
                return result;
            } catch (error) {
                if (signal.aborted || error instanceof InvalidAuctionIndexError ||
                    (error instanceof Error && error.name === 'AbortError')) throw error;
                timingLog('item.preparation.retry', context, {
                    stage: name, attempt, durationMs: performance.now() - start,
                    retryDelayMs, errorType: error instanceof Error ? error.name : 'UnknownError'
                });
                await delay(retryDelayMs, signal);
                retryDelayMs = Math.min(retryDelayMs * 2, cap);
            }
        }
    }
    try {
        const draft = await stage('itemGeneration', index => source.generateDraft(index, signal));
        signal.throwIfAborted();
        const audio_url = await stage('audioGeneration', () => source.generateAudio(draft, signal));
        if (signal.aborted) {
            await source.discardAudio(audio_url);
            signal.throwIfAborted();
        }
        timingLog('item.preparation.ready', context, { durationMs: performance.now() - started });
        return { ...draft, audio_url };
    } catch (error) {
        timingLog('item.preparation.stopped', context, { durationMs: performance.now() - started, errorType: error instanceof Error ? error.name : 'UnknownError' });
        throw error;
    }
}
