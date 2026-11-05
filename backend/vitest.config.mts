import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
        environment: 'node', setupFiles: ['./test-support/isolation.ts'], restoreMocks: true, unstubEnvs: true, unstubGlobals: true, exclude: ['**/node_modules/**', '**/dist/**'],
        coverage: {
            exclude: ['**/test-support/**'],
        },
    } });
