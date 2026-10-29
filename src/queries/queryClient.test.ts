import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client.ts'
import { createQueryClient, MAX_RETRIES, shouldRetry } from './queryClient.ts'

describe('shouldRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['no connection', new ApiError('network', 'Could not reach PokéAPI')],
    ['a timeout', new ApiError('timeout', 'Too slow')],
    ['a 500', new ApiError('http', 'Server error', 500)],
    ['a 503', new ApiError('http', 'Unavailable', 503)],
  ])('retries %s', (_label, error) => {
    expect(shouldRetry(0, error)).toBe(true)
  })

  it.each([
    ['a 404', new ApiError('not-found', 'Not found', 404)],
    ['a 400', new ApiError('http', 'Bad request', 400)],
    ['a 429', new ApiError('http', 'Too many requests', 429)],
    ['an unexpected response shape', new ApiError('invalid-response', 'Bad shape')],
    ['a cancel (not an ApiError)', new DOMException('Aborted', 'AbortError')],
  ])('never retries %s', (_label, error) => {
    expect(shouldRetry(0, error)).toBe(false)
  })

  it(`stops after ${MAX_RETRIES} retries`, () => {
    const error = new ApiError('timeout', 'Too slow')

    expect(shouldRetry(MAX_RETRIES - 1, error)).toBe(true)
    expect(shouldRetry(MAX_RETRIES, error)).toBe(false)
  })

  it('does not retry a network error while the browser reports being offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(shouldRetry(0, new ApiError('network', 'Could not reach PokéAPI'))).toBe(false)
  })
})

describe('createQueryClient', () => {
  it('keeps data for the whole visit and never pauses for the network', () => {
    const queries = createQueryClient().getDefaultOptions().queries

    expect(queries).toMatchObject({ staleTime: Infinity, gcTime: Infinity, networkMode: 'always' })
  })
})
