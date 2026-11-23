import { describe, it, expect, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { RoundTiming, currentRoundTiming, measureRoundStage, withRoundTiming } from './roundTiming';

function entries() {
    return [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls]
        .filter(([line]) => typeof line === 'string' && line.startsWith('{'))
        .map(([line]) => JSON.parse(line as string));
}

describe('structured round timing', () => {
    it('reports exclusive stage durations and overhead using a monotonic clock', async () => {
        let now = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.stubEnv('ROUND_TIMING_DETAILS', 'true');
        const timing = new RoundTiming('room-a', 1, 2);
        await withRoundTiming(timing, async () => {
            await measureRoundStage('settlement', async () => { now += 40; });
            await measureRoundStage('itemGeneration', async () => { now += 100; });
            await measureRoundStage('audioGeneration', async () => { now += 100; });
            timing.hadWinner = true;
            now += 10;
            timing.complete();
        });
        const logs = entries();
        expect(logs.filter(log => log.event === 'round.transition.stage.completed')).toHaveLength(3);
        expect(logs.at(-1)).toMatchObject({
            level: 'info', event: 'round.transition.completed', roomId: 'room-a',
            transitionId: timing.transitionId, completedRound: 1, nextRound: 2,
            hadWinner: true, durationMs: 250, status: 'success',
            breakdown: {settlementMs: 40, itemGenerationMs: 100, audioGenerationMs: 100, otherMs: 10},
        });
    });

    it('reports a failed stage once without leaking the error message or emitting a success summary', async () => {
        const timing = new RoundTiming('room-a', 1, 2);
        await expect(withRoundTiming(timing, () => measureRoundStage('audioGeneration', async () => {
            throw new Error('Bearer private-token; provider response');
        }))).rejects.toThrow('private-token');
        timing.fail(new Error('another error'));
        timing.complete();
        const logs = entries();
        expect(logs.filter(log => log.event === 'round.transition.failed')).toEqual([
            expect.objectContaining({level: 'error', stage: 'audioGeneration', status: 'failed', errorType: 'Error'}),
        ]);
        expect(logs.some(log => log.event === 'round.transition.completed')).toBe(false);
        expect(JSON.stringify(logs)).not.toMatch(/private-token|provider response/);
    });

    it('keeps interleaved room contexts separate across asynchronous work', async () => {
        const left = new RoundTiming('left', 1, 2);
        const right = new RoundTiming('right', 2, 3);
        const ids = await Promise.all([left, right].map(timing => withRoundTiming(timing, async () => {
            await Promise.resolve();
            const id = currentRoundTiming()!.transitionId;
            timing.complete();
            return id;
        })));
        expect(ids).toEqual([left.transitionId, right.transitionId]);
        expect(left.transitionId).not.toBe(right.transitionId);
        expect(currentRoundTiming()).toBeUndefined();
    });

    it('can disable timing logs and does not misreport a swallowed failure as successful', async () => {
        vi.stubEnv('ROUND_TIMING_LOGS', 'false');
        const disabled = new RoundTiming('disabled', 1, 2);
        disabled.complete();
        expect(entries()).toEqual([]);
        vi.stubEnv('ROUND_TIMING_LOGS', 'true');
        let now = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        const timing = new RoundTiming('room-a', 3, null);
        await timing.measure('settlement', async () => { now = 45; timing.fail(new Error('Persistence failed')); });
        timing.complete();
        expect(entries().filter(log => log.event === 'round.transition.failed')).toEqual([
            expect.objectContaining({durationMs: 45, breakdown: {settlementMs: 45, itemGenerationMs: 0, audioGenerationMs: 0, otherMs: 0}}),
        ]);
        expect(entries().some(log => log.status === 'success')).toBe(false);
    });
});
