import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // A simulated browser page, so components can render inside Node
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The most time one test may take (the default is 5 seconds). A test that shows a page for the
    // first time in its file also loads that page's code, which on a busy machine can push a
    // test that opens two pages past 5 seconds. Passing tests are not slowed down; only a stuck
    // test takes longer to be reported.
    testTimeout: 15_000,
    // e2e/ holds the Playwright browser tests (npm run e2e); Vitest must not pick them up
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
