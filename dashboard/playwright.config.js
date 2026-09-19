import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 45000, workers: 1,
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  webServer: {command: 'npm run dev -- --host 127.0.0.1', url: 'http://localhost:3000', reuseExistingServer: true},
});
