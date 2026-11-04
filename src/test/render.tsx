import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import type { Team } from '../domain/team.ts'
import { createQueryClient } from '../queries/queryClient.ts'
import { saveTeams, TEAMS_STORAGE_KEY } from '../storage/teamStorage.ts'
import { TeamsProvider } from '../teams/TeamsProvider.tsx'

// The app's real query settings, with retries switched off so error tests fail straight away.
// Tests about retrying pass their own client.
export function createTestQueryClient(): QueryClient {
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
  return client
}

// Puts teams in localStorage before a test renders. A list of teams is saved the normal way;
// a string is stored as-is, for tests about broken or hand-edited data.
// (setup.ts clears localStorage after every test.)
export function seedStoredTeams(teams: Team[] | string) {
  if (typeof teams === 'string') localStorage.setItem(TEAMS_STORAGE_KEY, teams)
  else saveTeams(localStorage, teams)
}

// Renders a component the way the app does: inside the query cache, the teams provider and
// a router at `url`. A fresh client per test, so no cached data leaks from one test into another.
// `storedTeams` seeds localStorage first (see seedStoredTeams).
// useTransitions={false} matches the app's BrowserRouter (see main.tsx).
export function renderWithProviders(
  ui: ReactNode,
  {
    url = '/',
    queryClient = createTestQueryClient(),
    storedTeams,
  }: { url?: string; queryClient?: QueryClient; storedTeams?: Team[] | string } = {},
) {
  if (storedTeams !== undefined) seedStoredTeams(storedTeams)
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TeamsProvider>
          <MemoryRouter initialEntries={[url]} useTransitions={false}>{ui}</MemoryRouter>
        </TeamsProvider>
      </QueryClientProvider>,
    ),
  }
}
