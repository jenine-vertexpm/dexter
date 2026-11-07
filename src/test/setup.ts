import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server.ts'

// How long findBy… and waitFor keep looking before they give up (the default is 1 second).
// Pages load on demand (App.tsx), and the first time a test file shows a page its code has to be
// loaded, which can take over a second on a busy machine. A wait ends as soon as what it looks
// for appears, so this doesn't slow down passing tests. It stays below the limit for a whole
// test (testTimeout in vite.config.ts).
configure({ asyncUtilTimeout: 5000 })

// A request with no matching handler fails the test, so tests can never reach the real PokéAPI
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  // Testing Library only cleans up automatically when test globals are on; we import them explicitly instead
  cleanup()
  // Saved teams from one test must not leak into the next
  localStorage.clear()
})
afterAll(() => server.close())
