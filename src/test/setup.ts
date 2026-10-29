import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server.ts'

// A request with no matching handler fails the test, so tests can never reach the real PokéAPI
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  // Testing Library only cleans up automatically when test globals are on; we import them explicitly instead
  cleanup()
})
afterAll(() => server.close())
