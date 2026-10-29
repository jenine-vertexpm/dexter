import { setupServer } from 'msw/node'

// Fake PokéAPI for tests. Starts with no handlers: each test adds the responses it needs
// with server.use(...), and they are cleared again after the test.
export const server = setupServer()
