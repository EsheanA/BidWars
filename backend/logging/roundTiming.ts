import { AsyncLocalStorage } from 'node:async_hooks';

export interface TimingContext {
    roomId: string;
    gameId: string;
    round: number;
    transitionId: string;
}

// Callers supply only IDs, counts, durations and error types, never provider data.
export function timingLog(event: string, context: TimingContext, fields: Record<string, unknown> = {}, detailed = false): void {
    if (process.env.ROUND_TIMING_LOGS === 'false' || (detailed && process.env.ROUND_TIMING_DETAILS !== 'true')) return;
    const level = event.endsWith('.failed') ? 'error' : event.endsWith('.retry') ? 'warn' : 'info';
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context, ...fields }));
}

const current = new AsyncLocalStorage<RoundTransition>();
export const withTransition = <T>(trace: RoundTransition, work: () => Promise<T>): Promise<T> => current.run(trace, work);
export const failCurrentTransition = (error: unknown): void => current.getStore()?.fail(error);

export class RoundTransition {
    private readonly started = performance.now();
    private readonly stages: Record<string, number> = {};
    private failed = false;
    private stage: string | undefined;
    constructor(readonly context: TimingContext, readonly completedRound: number, readonly nextRound: number | null) {
        timingLog('round.transition.started', context, { completedRound, nextRound });
    }

    async measure<T>(stage: string, work: () => Promise<T>): Promise<T> {
        const start = performance.now();
        this.stage = stage;
        let success = false;
        timingLog('round.stage.started', this.context, { stage }, true);
        try {
            const result = await work();
            success = true;
            return result;
        } catch (error) {
            this.fail(error);
            throw error;
        } finally {
            const durationMs = performance.now() - start;
            this.stages[stage] = (this.stages[stage] ?? 0) + durationMs;
            timingLog('round.stage.completed', this.context, { stage, durationMs, success }, true);
            this.stage = undefined;
        }
    }

    complete(hadWinner: boolean): void {
        if (this.failed) return;
        const durationMs = performance.now() - this.started;
        timingLog(this.nextRound === null ? 'round.completed' : 'round.transition.completed', this.context, {
            completedRound: this.completedRound, nextRound: this.nextRound, status: 'success', hadWinner, durationMs,
            breakdown: {
                settlementMs: this.stages.settlement ?? 0,
                preparationWaitMs: this.stages.preparationWait ?? 0,
                activationMs: this.stages.activation ?? 0,
                presenceRefreshMs: this.stages.presenceRefresh ?? 0,
                otherMs: Math.max(0, durationMs - Object.values(this.stages).reduce((a, b) => a + b, 0))
            }
        });
    }

    fail(error: unknown): void {
        if (this.failed) return;
        this.failed = true;
        timingLog('round.transition.failed', this.context, {
            completedRound: this.completedRound, nextRound: this.nextRound, status: 'failed',
            stage: this.stage,
            durationMs: performance.now() - this.started, errorType: error instanceof Error ? error.name : 'UnknownError'
        });
    }
}
