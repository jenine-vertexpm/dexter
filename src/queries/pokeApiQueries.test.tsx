import { onlineManager, QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import speciesDeoxys from '../test/fixtures/species-deoxys.json'
import typeSteel from '../test/fixtures/type-steel.json'
import { createTestQueryClient } from '../test/render.tsx'
import { server } from '../test/server.ts'
import { useEvolutionChain, useSpecies, useType } from './pokeApiQueries.ts'
import { createQueryClient } from './queryClient.ts'

const SPECIES_URL = 'https://pokeapi.co/api/v2/pokemon-species/:name'

// Serves `respond` at `url` and counts how many requests arrive
function countRequests(url: string, respond: () => Response | Promise<Response>) {
  const counter = { requests: 0 }
  server.use(
    http.get(url, () => {
      counter.requests += 1
      return respond()
    }),
  )
  return counter
}

// Lets renderHook use a hook the way a component inside the app would
function withClient(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// The app's real retry rule, but with a 1 ms wait between tries instead of 1 s, 2 s, 4 s
function createFastRetryClient(): QueryClient {
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 1 } })
  return client
}

describe('caching', () => {
  it('makes one request when two components ask for the same data', async () => {
    const counter = countRequests(SPECIES_URL, () => HttpResponse.json(speciesDeoxys))
    const client = createTestQueryClient()

    const first = renderHook(() => useSpecies('deoxys'), { wrapper: withClient(client) })
    const second = renderHook(() => useSpecies('Deoxys'), { wrapper: withClient(client) })

    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))
    expect(counter.requests).toBe(1)
  })

  it('makes no new request when returning after more than 5 minutes', async () => {
    const counter = countRequests(SPECIES_URL, () => HttpResponse.json(speciesDeoxys))
    const client = createTestQueryClient()
    const firstVisit = renderHook(() => useSpecies('deoxys'), { wrapper: withClient(client) })
    await waitFor(() => expect(firstVisit.result.current.isSuccess).toBe(true))

    // Leave the page, then let 6 minutes pass. With TanStack's default gcTime (5 minutes)
    // the unused data would be deleted here. Fake time must start before leaving, because
    // leaving is what starts TanStack's deletion timer.
    vi.useFakeTimers()
    firstVisit.unmount()
    vi.advanceTimersByTime(6 * 60 * 1000)
    vi.useRealTimers()

    const secondVisit = renderHook(() => useSpecies('deoxys'), { wrapper: withClient(client) })
    expect(secondVisit.result.current.data?.name).toBe('deoxys')
    expect(counter.requests).toBe(1)
  })
})

describe('cancellation', () => {
  it('cancels the request when the component using it goes away', async () => {
    let requestSignal: AbortSignal | undefined
    server.use(
      http.get(SPECIES_URL, async ({ request }) => {
        requestSignal = request.signal
        await delay('infinite')
        return HttpResponse.json(speciesDeoxys)
      }),
    )
    const view = renderHook(() => useSpecies('deoxys'), { wrapper: withClient(createTestQueryClient()) })
    await waitFor(() => expect(requestSignal).toBeDefined())

    view.unmount()

    await waitFor(() => expect(requestSignal?.aborted).toBe(true))
  })
})

describe('retries', () => {
  it('retries a server error and then succeeds', async () => {
    let attempt = 0
    server.use(
      http.get(SPECIES_URL, () => {
        attempt += 1
        return attempt === 1 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(speciesDeoxys)
      }),
    )

    const { result } = renderHook(() => useSpecies('deoxys'), { wrapper: withClient(createFastRetryClient()) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(attempt).toBe(2)
  })

  it('gives up after 3 retries (4 requests in total) and shows the error', async () => {
    const counter = countRequests(SPECIES_URL, () => new HttpResponse(null, { status: 503 }))

    const { result } = renderHook(() => useSpecies('deoxys'), { wrapper: withClient(createFastRetryClient()) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(counter.requests).toBe(4)
    expect(result.current.error).toMatchObject({ kind: 'http', status: 503 })
  })

  it('never retries a 404', async () => {
    const counter = countRequests(SPECIES_URL, () => new HttpResponse(null, { status: 404 }))

    const { result } = renderHook(() => useSpecies('pikachuu'), { wrapper: withClient(createFastRetryClient()) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(counter.requests).toBe(1)
    expect(result.current.error).toMatchObject({ kind: 'not-found' })
  })

  it('never retries a response in an unexpected shape', async () => {
    const counter = countRequests(SPECIES_URL, () => HttpResponse.json({ unexpected: true }))

    const { result } = renderHook(() => useSpecies('deoxys'), { wrapper: withClient(createFastRetryClient()) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(counter.requests).toBe(1)
    expect(result.current.error).toMatchObject({ kind: 'invalid-response' })
  })
})

describe('offline', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
    vi.restoreAllMocks()
  })

  it('shows an error straight away instead of waiting for the connection', async () => {
    // Both ways the app can learn it is offline: TanStack's own flag and the browser's
    onlineManager.setOnline(false)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const counter = countRequests(SPECIES_URL, () => HttpResponse.error())

    const { result } = renderHook(() => useSpecies('deoxys'), { wrapper: withClient(createFastRetryClient()) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isPaused).toBe(false)
    expect(result.current.error).toMatchObject({ kind: 'network' })
    expect(counter.requests).toBe(1)
  })
})

describe('retry button', () => {
  it('loads the data when refetch is called after an error', async () => {
    let fail = true
    server.use(
      http.get('https://pokeapi.co/api/v2/type/:name', () =>
        fail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(typeSteel),
      ),
    )
    const { result } = renderHook(() => useType('steel'), { wrapper: withClient(createTestQueryClient()) })
    await waitFor(() => expect(result.current.isError).toBe(true))

    fail = false
    void result.current.refetch()

    await waitFor(() => expect(result.current.data?.name).toBe('steel'))
  })
})

describe('useEvolutionChain', () => {
  it('waits, without requesting anything, while there is no chain id', () => {
    const counter = countRequests('https://pokeapi.co/api/v2/evolution-chain/:id', () => HttpResponse.json({}))

    const { result } = renderHook(() => useEvolutionChain(null), { wrapper: withClient(createTestQueryClient()) })

    expect(result.current.isPending).toBe(true)
    expect(result.current.fetchStatus).toBe('idle')
    expect(counter.requests).toBe(0)
  })
})
