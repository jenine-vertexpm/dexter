import { defineConfig, devices } from '@playwright/test'

// End-to-end (E2E) tests: Playwright opens a real Chromium browser and clicks through Dexter as
// served by the production container (nginx + the built app), decision D19. M4 plan §5.2.
//
// E2E_BASE_URL says where the app is running. CI starts the image it just built and sets it.
// Without it, Playwright starts the container itself with `docker compose up --build`, waits for
// /healthz, and reuses a container that is already running.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080'

export default defineConfig({
  testDir: './e2e',
  // A test.only left in by mistake fails the CI run instead of silently skipping the other tests
  forbidOnly: !!process.env.CI,
  // No retries: a test that only passes the second time is a flaky test to fix, not to hide
  retries: 0,
  // The list in the terminal, plus an HTML report in playwright-report/ (CI uploads it on failure)
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // On failure, keep a trace (every step, with snapshots of the page) and a screenshot
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Chromium only (D19)
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'docker compose up --build',
        url: `${baseURL}/healthz`,
        reuseExistingServer: true,
        // Building the image can take a few minutes the first time
        timeout: 300_000,
      },
})
