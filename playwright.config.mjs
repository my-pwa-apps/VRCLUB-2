import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
    testDir: './test/e2e',
    outputDir: 'test-results',
    timeout: 300_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${port}`,
        headless: true,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        launchOptions: {
            args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
        }
    },
    webServer: {
        command: 'npm run start:prod',
        url: `http://127.0.0.1:${port}`,
        env: { PORT: String(port), HOST: '127.0.0.1' },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
    }
});