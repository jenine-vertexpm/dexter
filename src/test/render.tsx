import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { createQueryClient } from '../queries/queryClient.ts'

// The app's real query settings, with retries switched off so error tests fail straight away.
// Tests about retrying pass their own client.
export function createTestQueryClient(): QueryClient {
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
  return client
}

// Renders a component the way the app does: inside the query cache and a router at `url`.
// A fresh client per test, so no cached data leaks from one test into another.
export function renderWithProviders(
  ui: ReactNode,
  { url = '/', queryClient = createTestQueryClient() }: { url?: string; queryClient?: QueryClient } = {},
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}
