import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

// `npm run dev` only: serves /config.js with the local settings, as the container does when it starts
// (src/config.ts, M5 plan D38). The production build never contains a config file.
function devRuntimeConfig(): Plugin {
  const config = { apiBaseUrl: 'https://pokeapi.co/api/v2', environment: 'local' }
  return {
    name: 'dexter-dev-runtime-config',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/config.js', (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(`window.__DEXTER_CONFIG__=${JSON.stringify(config)};\n`)
      })
    },
  }
}

// https://vite.dev/config/
// https://vitest.dev/config/
export default defineConfig({
  plugins: [react(), devRuntimeConfig()],
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
