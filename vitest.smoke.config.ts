import { defineConfig } from 'vitest/config'

// The smoke test against the real PokéAPI (M4 plan H9, §5.4): `npm run smoke`.
//
// Kept apart from the normal tests on purpose:
// - `npm test` uses vite.config.ts, which only picks up *.test.* files, so it never runs these.
// - Node, not the simulated browser (jsdom), and no setup file: MSW (the fake PokéAPI used by
//   `npm test`) is never started, so every request goes to the real API with Node's own fetch.
export default defineConfig({
  test: {
    include: ['smoke/**/*.smoke.ts'],
    environment: 'node',
    // A slow public API shouldn't count as a failure. The client gives up after 10 s per request.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
