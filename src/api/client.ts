import type { z } from 'zod'
import {
  evolutionChainSchema,
  pokemonSchema,
  speciesIndexSchema,
  speciesSchema,
  typeSchema,
  type ApiEvolutionChain,
  type ApiPokemon,
  type ApiSpecies,
  type ApiSpeciesIndex,
  type ApiType,
} from './schemas.ts'

const BASE_URL = 'https://pokeapi.co/api/v2'

// A request that takes longer than this is cancelled and reported as a 'timeout' error
export const REQUEST_TIMEOUT_MS = 10_000

// Comfortably above the 1025 species that exist today. The schema checks nothing was cut off.
const SPECIES_INDEX_LIMIT = 100_000

export type ApiErrorKind = 'not-found' | 'http' | 'network' | 'timeout' | 'invalid-response'

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

// The one place that talks to PokéAPI: fetch, check the status, parse JSON, validate with the schema.
// `what` describes the resource for error messages, e.g. 'Pokémon "eevee"'.
async function getJson<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  what: string,
  signal?: AbortSignal,
): Promise<z.infer<Schema>> {
  // Our own timer (rather than AbortSignal.timeout) so tests can fast-forward it with fake timers
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
  const combinedSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal

  // When fetch or reading the body throws, work out why: the caller cancelled, we timed out, or something else
  const explain = (error: unknown, otherwise: ApiError): unknown => {
    if (signal?.aborted) return error
    if (timeout.signal.aborted) {
      return new ApiError('timeout', `Request for ${what} took longer than ${REQUEST_TIMEOUT_MS / 1000} seconds`)
    }
    return otherwise
  }

  try {
    let response: Response
    try {
      response = await fetch(`${BASE_URL}${path}`, { signal: combinedSignal })
    } catch (error) {
      throw explain(error, new ApiError('network', 'Could not reach PokéAPI'))
    }

    if (response.status === 404) {
      throw new ApiError('not-found', `${what} not found`, 404)
    }
    if (!response.ok) {
      throw new ApiError('http', `PokéAPI responded with ${response.status}`, response.status)
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      throw explain(error, new ApiError('invalid-response', `Response for ${what} was not valid JSON`))
    }

    const result = schema.safeParse(body)
    if (!result.success) {
      throw new ApiError('invalid-response', `Unexpected response for ${what}: ${result.error.message}`)
    }
    return result.data
  } finally {
    clearTimeout(timer)
  }
}

export function getPokemon(name: string, signal?: AbortSignal): Promise<ApiPokemon> {
  return getJson(`/pokemon/${encodeURIComponent(name.toLowerCase())}`, pokemonSchema, `Pokémon "${name}"`, signal)
}

// By id rather than name: a species' default Pokémon can have a different name ("deoxys" → "deoxys-normal")
export function getPokemonById(id: number, signal?: AbortSignal): Promise<ApiPokemon> {
  return getJson(`/pokemon/${id}`, pokemonSchema, `Pokémon #${id}`, signal)
}

// Every species name in one request. Search, type filtering and pagination run on this list in the browser.
export function getSpeciesIndex(signal?: AbortSignal): Promise<ApiSpeciesIndex> {
  return getJson(`/pokemon-species?limit=${SPECIES_INDEX_LIMIT}`, speciesIndexSchema, 'the species list', signal)
}

export function getSpecies(name: string, signal?: AbortSignal): Promise<ApiSpecies> {
  return getJson(
    `/pokemon-species/${encodeURIComponent(name.toLowerCase())}`,
    speciesSchema,
    `Species "${name}"`,
    signal,
  )
}

export function getEvolutionChain(id: number, signal?: AbortSignal): Promise<ApiEvolutionChain> {
  return getJson(`/evolution-chain/${id}`, evolutionChainSchema, `evolution chain #${id}`, signal)
}

export function getType(name: string, signal?: AbortSignal): Promise<ApiType> {
  return getJson(`/type/${encodeURIComponent(name.toLowerCase())}`, typeSchema, `type "${name}"`, signal)
}
