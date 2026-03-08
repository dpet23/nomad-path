import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.test.ts', 'preprocessing/**/*.test.js'],
        passWithNoTests: true,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts', 'preprocessing/**/*.js'],
            exclude: ['src/**/*.test.ts', 'preprocessing/**/*.test.js', 'preprocessing/fixtures/**'],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
