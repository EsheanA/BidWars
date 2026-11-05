import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['./test-support/isolation.ts'],
        restoreMocks: true,
        unstubEnvs: true,
        unstubGlobals: true,
        exclude: ['**/node_modules/**', '**/dist/**'],
        coverage: {
            include: ['**/*.ts'],
            thresholds: { lines: 80, statements: 80 },
            exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', '**/test-support/**', '**/node_modules/**', '**/dist/**'],
        },
    },
});
