import { describe, it, expect, vi } from 'vitest';
import { generated, deferred } from '../test-support/fixtures';
import { prepareMedia, type PreparationSource } from './itemPreparation';

const context = { roomId: 'r1', gameId: 'game1', round: 2, transitionId: 'transition1' };
function setup() {
    vi.useFakeTimers();
    vi.stubEnv('ITEM_PREPARATION_RETRY_MS', '100');
    vi.stubEnv('ITEM_PREPARATION_RETRY_CAP_MS', '250');
    const controller = new AbortController();
    const source = {
        generateDraft: vi.fn<PreparationSource['generateDraft']>().mockResolvedValue(generated),
        generateAudio: vi.fn<PreparationSource['generateAudio']>().mockResolvedValue(generated.audio_url),
        discardAudio: vi.fn<PreparationSource['discardAudio']>().mockResolvedValue()
    };
    const beforeAttempt = vi.fn(async () => 0);
    const run = () => prepareMedia(source, context, controller.signal, beforeAttempt);
    return { source, controller, beforeAttempt, run };
}

describe('background media preparation', () => {
    it('retains the successful draft and retries only audio with increasing, capped delays', async () => {
        const { source, run } = setup();
        source.generateAudio.mockRejectedValueOnce(new Error('secret provider payload'))
            .mockRejectedValueOnce(new Error('speech unavailable')).mockRejectedValueOnce(new Error('speech unavailable'));
        let ready = false;
        const task = run().then(result => { ready = true; return result; });
        await vi.advanceTimersByTimeAsync(0);
        expect(source.generateAudio).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(99);
        expect(source.generateAudio).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(source.generateAudio).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(200);
        expect(source.generateAudio).toHaveBeenCalledTimes(3);
        expect(ready).toBe(false);
        await vi.advanceTimersByTimeAsync(250);
        expect(await task).toEqual(generated);
        expect(source.generateDraft).toHaveBeenCalledOnce();
        expect(source.generateAudio.mock.calls.every(([draft]) => draft === generated)).toBe(true);
        const records = vi.mocked(console.log).mock.calls.map(([line]) => JSON.parse(line));
        expect(records.filter(record => record.event === 'item.preparation.retry')).toHaveLength(3);
        expect(records.find(record => record.event === 'item.preparation.ready')).toMatchObject(context);
        expect(JSON.stringify(records)).not.toContain('secret provider payload');
        expect(JSON.stringify(records)).not.toContain(generated.item.item_description);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('retries a failed item request before starting audio', async () => {
        const { source, run } = setup();
        source.generateDraft.mockRejectedValueOnce(new Error('offline'));
        const task = run();
        await vi.advanceTimersByTimeAsync(0);
        expect(source.generateAudio).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(100);
        expect(await task).toEqual(generated);
        expect(source.generateDraft).toHaveBeenCalledTimes(2);
        expect(source.generateAudio).toHaveBeenCalledOnce();
    });

    it('cancels a pending retry and never starts another request', async () => {
        const { source, controller, run } = setup();
        source.generateDraft.mockRejectedValue(new Error('offline'));
        const stopped = run().catch(error => error);
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        expect((await stopped).name).toBe('AbortError');
        await vi.advanceTimersByTimeAsync(10000);
        expect(source.generateDraft).toHaveBeenCalledOnce();
        expect(source.generateAudio).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['item', 'audio'])('discards late audio or stops before audio after cancellation during %s', async stage => {
        const { source, controller, run } = setup();
        const draft = deferred<typeof generated>();
        const audio = deferred<string>();
        source.generateDraft.mockReturnValueOnce(draft.promise);
        source.generateAudio.mockReturnValueOnce(audio.promise);
        const stopped = run().catch(error => error);
        await vi.advanceTimersByTimeAsync(0);
        if (stage === 'audio') {
            draft.resolve(generated);
            await vi.advanceTimersByTimeAsync(0);
        }
        controller.abort();
        draft.resolve(generated);
        audio.resolve(generated.audio_url);
        expect((await stopped).name).toBe('AbortError');
        expect(source.discardAudio).toHaveBeenCalledTimes(stage === 'audio' ? 1 : 0);
        expect(source.generateAudio).toHaveBeenCalledTimes(stage === 'audio' ? 1 : 0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops before a provider call when the room is abandoned', async () => {
        const { source, beforeAttempt, run } = setup();
        beforeAttempt.mockRejectedValue(new DOMException('Room missing', 'AbortError'));
        await expect(run()).rejects.toMatchObject({ name: 'AbortError' });
        expect(source.generateDraft).not.toHaveBeenCalled();
        expect(source.generateAudio).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
