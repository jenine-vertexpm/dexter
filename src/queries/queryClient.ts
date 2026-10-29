import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client.ts'

export const MAX_RETRIES = 3

// Which failures are worth trying again. TanStack Query waits between tries (1 s, 2 s, 4 s).
// - Retried: no connection, timeout, server errors (5xx). These are often temporary.
// - Never retried: 404, other 4xx, or a response in an unexpected shape. Asking again gives the same answer.
// - A cancel by the caller is never retried either: it is not an ApiError.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES || !(error instanceof ApiError)) return false
  switch (error.kind) {
    case 'network':
      // If the browser knows it is offline, retrying only delays the error message
      return navigator.onLine
    case 'timeout':
      return true
    case 'http':
      return error.status !== undefined && error.status >= 500
    case 'not-found':
    case 'invalid-response':
      return false
  }
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // PokéAPI data does not change while someone is browsing, so once fetched it is kept and
        // reused for the whole visit. Both settings are needed for "returning to a page makes no
        // requests" (brief §3.2): staleTime keeps data fresh, gcTime stops unused data being
        // deleted (by default after 5 minutes).
        staleTime: Infinity,
        gcTime: Infinity,
        // Fresh data is never refetched anyway; these make the intent explicit
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: shouldRetry,
        // 'always': when offline, a request fails and shows an error with a retry button.
        // The default ('online') would pause it instead, leaving the page loading indefinitely.
        networkMode: 'always',
      },
    },
  })
}
