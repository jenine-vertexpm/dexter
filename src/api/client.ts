import { pokemonSchema, type ApiPokemon } from './schemas.ts'

const BASE_URL = 'https://pokeapi.co/api/v2'

export type ApiErrorKind = 'not-found' | 'http' | 'network' | 'invalid-response'

// Every failure from this module is an ApiError, so callers can show the right message.
// The one exception: if the caller cancels via `signal`, the browser's AbortError is rethrown unchanged.
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export async function getPokemon(name: string, signal?: AbortSignal): Promise<ApiPokemon> {
  const url = `${BASE_URL}/pokemon/${encodeURIComponent(name.toLowerCase())}`
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('network', 'Could not reach PokéAPI')
  }

  if (response.status === 404) {
    throw new ApiError('not-found', `Pokémon "${name}" not found`, 404)
  }
  if (!response.ok) {
    throw new ApiError('http', `PokéAPI responded with ${response.status}`, response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('invalid-response', `Response for "${name}" was not valid JSON`)
  }

  const result = pokemonSchema.safeParse(body)
  if (!result.success) {
    throw new ApiError('invalid-response', `Unexpected response for "${name}": ${result.error.message}`)
  }
  return result.data
}
