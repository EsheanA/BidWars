import { it, expect, vi } from 'vitest';
import { RoundTransition, timingLog, withTransition, failCurrentTransition } from './roundTiming';
const context = { roomId: 'r1', gameId: 'g1', round: 2, transitionId: 't1' };
const records = () => vi.mocked(console.log).mock.calls.flatMap(([value]) => {
    try { return [JSON.parse(value)]; } catch { return []; }
});

it('keeps full background preparation outside the timer-expiry-to-emission breakdown', async () => {
    vi.stubEnv('ROUND_TIMING_LOGS', 'true');
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    timingLog('item.preparation.started', context);
    now = 20000;
    const trace = new RoundTransition(context, 1, 2);
    await trace.measure('settlement', async () => { now += 500; });
    await trace.measure('preparationWait', async () => {
        now += 3000;
        timingLog('item.preparation.ready', context, { durationMs: 23500 });
    });
    await trace.measure('activation', async () => { now += 100; });
    await trace.measure('presenceRefresh', async () => { now += 50; });
    now += 25;
    trace.complete(true);
    expect(records().find(record => record.event === 'round.transition.completed')).toMatchObject({
        ...context, completedRound: 1, nextRound: 2, durationMs: 3675,
        breakdown: { settlementMs: 500, preparationWaitMs: 3000, activationMs: 100, presenceRefreshMs: 50, otherMs: 25 }
    });
    expect(records().find(record => record.event === 'item.preparation.ready').durationMs).toBe(23500);
});

it('reports a swallowed settlement failure once, without a success summary or sensitive error text', async () => {
    vi.stubEnv('ROUND_TIMING_LOGS', 'true');
    const trace = new RoundTransition(context, 1, 2);
    await withTransition(trace, async () => failCurrentTransition(new Error('secret and item description')));
    trace.fail(new Error('duplicate'));
    trace.complete(true);
    expect(records().filter(record => record.event === 'round.transition.failed')).toHaveLength(1);
    expect(records().some(record => record.event === 'round.transition.completed')).toBe(false);
    expect(JSON.stringify(records())).not.toContain('secret');
});

it('supports detailed stage logs, final settlement summaries, and disabling timing output', async () => {
    vi.stubEnv('ROUND_TIMING_LOGS', 'true');
    vi.stubEnv('ROUND_TIMING_DETAILS', 'true');
    const trace = new RoundTransition(context, 3, null);
    await trace.measure('settlement', async () => {});
    trace.complete(false);
    expect(records().map(record => record.event)).toEqual([
        'round.transition.started', 'round.stage.started', 'round.stage.completed', 'round.completed'
    ]);
    vi.mocked(console.log).mockClear();
    vi.stubEnv('ROUND_TIMING_LOGS', 'false');
    const disabled = new RoundTransition(context, 1, 2);
    disabled.complete(true);
    expect(console.log).not.toHaveBeenCalled();
});
