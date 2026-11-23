import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

type Stage = 'settlement' | 'itemGeneration' | 'audioGeneration';
const context = new AsyncLocalStorage<RoundTiming | undefined>();
const rounded = (value: number) => Math.round(value * 100) / 100;

/** One independent measurement context per room/round, including nested awaits. */
export class RoundTiming {
    readonly transitionId = randomUUID();
    private readonly started = performance.now();
    private readonly durations: Record<Stage, number> = { settlement: 0, itemGeneration: 0, audioGeneration: 0 };
    private ended = false;
    private active: { stage: Stage; started: number } | undefined;
    stage = 'other';
    hadWinner: boolean | null = null;

    constructor(readonly roomId: string, readonly completedRound: number, readonly nextRound: number | null) {
        this.write('info', 'round.transition.started', { status: 'started' });
    }

    private write(level: 'info' | 'error', event: string, fields: object) {
        if (process.env.ROUND_TIMING_LOGS === 'false') return;
        const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event,
            roomId: this.roomId, transitionId: this.transitionId,
            completedRound: this.completedRound, nextRound: this.nextRound, ...fields });
        if (level === 'error') console.error(line);
        else console.log(line);
    }

    private breakdown() {
        const now = performance.now();
        const durationMs = now - this.started;
        const durations = { ...this.durations };
        if (this.active) durations[this.active.stage] += now - this.active.started;
        return { durationMs: rounded(durationMs), breakdown: {
            settlementMs: rounded(durations.settlement),
            itemGenerationMs: rounded(durations.itemGeneration),
            audioGenerationMs: rounded(durations.audioGeneration),
            otherMs: rounded(Math.max(0, durationMs - Object.values(durations).reduce((a, b) => a + b, 0))),
        } };
    }

    async measure<T>(stage: Stage, operation: () => Promise<T>): Promise<T> {
        this.stage = stage;
        const started = performance.now();
        this.active = { stage, started };
        if (process.env.ROUND_TIMING_DETAILS === 'true') this.write('info', 'round.transition.stage.started', { stage });
        try {
            const result = await operation();
            const duration = performance.now() - started;
            this.durations[stage] += duration;
            this.active = undefined;
            if (!this.ended && process.env.ROUND_TIMING_DETAILS === 'true') {
                this.write('info', 'round.transition.stage.completed', { stage, durationMs: rounded(duration), status: 'success' });
            }
            this.stage = 'other';
            return result;
        } catch (error) {
            this.durations[stage] += performance.now() - started;
            this.active = undefined;
            this.fail(error);
            throw error;
        }
    }

    complete() {
        if (this.ended) return;
        this.write('info', this.nextRound === null ? 'round.completed' : 'round.transition.completed', {
            status: 'success', hadWinner: this.hadWinner, ...this.breakdown(),
        });
        this.ended = true;
    }

    fail(error: unknown) {
        if (this.ended) return;
        // Error messages/stacks can contain provider responses or credentials.
        this.write('error', 'round.transition.failed', {
            status: 'failed', stage: this.stage, errorType: error instanceof Error ? error.name : 'Error',
            hadWinner: this.hadWinner, ...this.breakdown(),
        });
        this.ended = true;
    }
}

export const currentRoundTiming = () => context.getStore();
export function withRoundTiming<T>(timing: RoundTiming | undefined, operation: () => Promise<T>): Promise<T> {
    return context.run(timing, operation);
}
export function measureRoundStage<T>(stage: Stage, operation: () => Promise<T>): Promise<T> {
    const timing = currentRoundTiming();
    return timing ? timing.measure(stage, operation) : operation();
}
