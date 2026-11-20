import { defineConfig, devices } from '@playwright/test';

const PORT = 5210;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  // Software WebGL (SwiftShader) is slow when several workers draw at once.
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Software WebGL so the 3D sky renders in headless Chromium (the no-WebGL path is tested with ?nowebgl).
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npx vite --mode demo --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_X10_LATENCY: '0' },
  },
});
