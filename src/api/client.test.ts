import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import chainBulbasaur from '../test/fixtures/evolution-chain-1-bulbasaur.json'
import chainOddish from '../test/fixtures/evolution-chain-18-oddish.json'
import chainEevee from '../test/fixtures/evolution-chain-67-eevee.json'
import deoxysNormal from '../test/fixtures/pokemon-386-deoxys-normal.json'
import speciesDeoxys from '../test/fixtures/species-deoxys.json'
import speciesIndex from '../test/fixtures/species-index.json'
import typeSteel from '../test/fixtures/type-steel.json'
import { server } from '../test/server.ts'
import {
  ApiError,
  getEvolutionChain,
  getPokemon,
  getPokemonById,
  getSpecies,
  getSpeciesIndex,
  getType,
  REQUEST_TIMEOUT_MS,
} from './client.ts'

const POKEMON_URL = 'https://pokeapi.co/api/v2/pokemon/:name'

// Only the fields pokemonSchema reads, with Eevee's real values
const eevee = {
  id: 133,
  name: 'eevee',
  height: 3,
  weight: 65,
  types: [{ slot: 1, type: { name: 'normal', url: 'https://pokeapi.co/api/v2/type/1/' } }],
  stats: [{ base_stat: 55, stat: { name: 'hp', url: 'https://pokeapi.co/api/v2/stat/1/' } }],
  abilities: [
    { is_hidden: false, slot: 1, ability: { name: 'run-away', url: 'https://pokeapi.co/api/v2/ability/50/' } },
  ],
  sprites: { other: { 'official-artwork': { front_default: null } } },
  species: { name: 'eevee', url: 'https://pokeapi.co/api/v2/pokemon-species/133/' },
}

// Runs the call and returns what it threw, so a test can check the error's details
async function errorFrom(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected the call to fail, but it succeeded')
}

describe('getPokemon', () => {
  it('returns the validated Pokémon', async () => {
    server.use(http.get(POKEMON_URL, () => HttpResponse.json(eevee)))

    const pokemon = await getPokemon('eevee')

    expect(pokemon.name).toBe('eevee')
    expect(pokemon.sprites.other['official-artwork'].front_default).toBeNull()
  })

  it('requests the lower-case name', async () => {
    let requestedName: unknown
    server.use(
      http.get(POKEMON_URL, ({ params }) => {
        requestedName = params.name
        return HttpResponse.json(eevee)
      }),
    )

    await getPokemon('Eevee')

    expect(requestedName).toBe('eevee')
  })

  it('throws a not-found ApiError for a 404', async () => {
    server.use(http.get(POKEMON_URL, () => new HttpResponse('Not Found', { status: 404 })))

    const error = await errorFrom(getPokemon('pikachuu'))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'not-found', status: 404 })
  })

  it('throws an http ApiError for a server error', async () => {
    server.use(http.get(POKEMON_URL, () => new HttpResponse(null, { status: 500 })))

    const error = await errorFrom(getPokemon('eevee'))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'http', status: 500 })
  })

  it('throws an invalid-response ApiError when the body does not match the schema', async () => {
    server.use(http.get(POKEMON_URL, () => HttpResponse.json({ ...eevee, types: [] })))

    const error = await errorFrom(getPokemon('eevee'))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'invalid-response' })
  })

  it('throws an invalid-response ApiError when the body is not JSON', async () => {
    server.use(http.get(POKEMON_URL, () => new HttpResponse('<html>oops</html>', { status: 200 })))

    const error = await errorFrom(getPokemon('eevee'))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'invalid-response' })
  })

  it('throws a network ApiError when the request cannot be made', async () => {
    server.use(http.get(POKEMON_URL, () => HttpResponse.error()))

    const error = await errorFrom(getPokemon('eevee'))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'network' })
  })

  it('rethrows the AbortError, not an ApiError, when the caller cancels', async () => {
    // The response never arrives, so only the cancel can end the request
    server.use(
      http.get(POKEMON_URL, async () => {
        await delay('infinite')
        return HttpResponse.json(eevee)
      }),
    )
    const controller = new AbortController()

    const request = getPokemon('eevee', controller.signal)
    controller.abort()
    const error = await errorFrom(request)

    expect(error).not.toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ name: 'AbortError' })
  })
})

const API = 'https://pokeapi.co/api/v2'

// The checks every endpoint shares: valid data, wrong shape, 404, server error, no connection.
// `invalid` is the real fixture with one required field broken.
const endpoints = [
  {
    name: 'getPokemonById',
    url: `${API}/pokemon/386`,
    call: (signal?: AbortSignal) => getPokemonById(386, signal),
    valid: deoxysNormal,
    invalid: { ...deoxysNormal, types: [] },
  },
  {
    name: 'getSpeciesIndex',
    url: `${API}/pokemon-species`,
    call: (signal?: AbortSignal) => getSpeciesIndex(signal),
    valid: speciesIndex,
    invalid: { ...speciesIndex, results: 'not a list' },
  },
  {
    name: 'getSpecies',
    url: `${API}/pokemon-species/deoxys`,
    call: (signal?: AbortSignal) => getSpecies('deoxys', signal),
    valid: speciesDeoxys,
    invalid: { ...speciesDeoxys, varieties: [] },
  },
  {
    name: 'getEvolutionChain',
    url: `${API}/evolution-chain/67`,
    call: (signal?: AbortSignal) => getEvolutionChain(67, signal),
    valid: chainEevee,
    invalid: { ...chainEevee, chain: { ...chainEevee.chain, species: null } },
  },
  {
    name: 'getType',
    url: `${API}/type/steel`,
    call: (signal?: AbortSignal) => getType('steel', signal),
    valid: typeSteel,
    invalid: { ...typeSteel, damage_relations: {} },
  },
]

describe.each(endpoints)('$name', ({ url, call, valid, invalid }) => {
  it('returns the validated data', async () => {
    server.use(http.get(url, () => HttpResponse.json(valid)))

    // Schemas drop fields we don't use, so compare a field every fixture has
    await expect(call()).resolves.toHaveProperty('count' in valid ? 'count' : 'id', 'count' in valid ? valid.count : valid.id)
  })

  it('throws invalid-response when the body has the wrong shape', async () => {
    server.use(http.get(url, () => HttpResponse.json(invalid)))

    expect(await errorFrom(call())).toMatchObject({ name: 'ApiError', kind: 'invalid-response' })
  })

  it('throws not-found for a 404', async () => {
    server.use(http.get(url, () => new HttpResponse('Not Found', { status: 404 })))

    expect(await errorFrom(call())).toMatchObject({ name: 'ApiError', kind: 'not-found', status: 404 })
  })

  it('throws http with the status for a server error', async () => {
    server.use(http.get(url, () => new HttpResponse(null, { status: 503 })))

    expect(await errorFrom(call())).toMatchObject({ name: 'ApiError', kind: 'http', status: 503 })
  })

  it('throws network when the request cannot be made', async () => {
    server.use(http.get(url, () => HttpResponse.error()))

    expect(await errorFrom(call())).toMatchObject({ name: 'ApiError', kind: 'network' })
  })
})

describe('getPokemonById', () => {
  it('finds a default Pokémon whose name differs from its species (deoxys → deoxys-normal)', async () => {
    server.use(http.get(`${API}/pokemon/386`, () => HttpResponse.json(deoxysNormal)))

    const pokemon = await getPokemonById(386)

    expect(pokemon.name).toBe('deoxys-normal')
    expect(pokemon.species.name).toBe('deoxys')
  })
})

describe('getSpeciesIndex', () => {
  it('asks for every species in one request', async () => {
    let limit: string | null = null
    server.use(
      http.get(`${API}/pokemon-species`, ({ request }) => {
        limit = new URL(request.url).searchParams.get('limit')
        return HttpResponse.json(speciesIndex)
      }),
    )

    const index = await getSpeciesIndex()

    expect(Number(limit)).toBeGreaterThan(index.count)
    expect(index.results).toHaveLength(index.count)
  })

  it('throws invalid-response when the list is cut short', async () => {
    server.use(
      http.get(`${API}/pokemon-species`, () =>
        HttpResponse.json({ ...speciesIndex, results: speciesIndex.results.slice(0, 10) }),
      ),
    )

    expect(await errorFrom(getSpeciesIndex())).toMatchObject({ kind: 'invalid-response' })
  })
})

describe('getSpecies', () => {
  it('keeps the varieties, including which one is the default', async () => {
    server.use(http.get(`${API}/pokemon-species/deoxys`, () => HttpResponse.json(speciesDeoxys)))

    const species = await getSpecies('deoxys')

    const defaults = species.varieties.filter((variety) => variety.is_default)
    expect(defaults.map((variety) => variety.pokemon.name)).toEqual(['deoxys-normal'])
  })

  it('accepts a species without an evolution chain', async () => {
    server.use(
      http.get(`${API}/pokemon-species/deoxys`, () => HttpResponse.json({ ...speciesDeoxys, evolution_chain: null })),
    )

    await expect(getSpecies('deoxys')).resolves.toMatchObject({ evolution_chain: null })
  })
})

describe('getEvolutionChain', () => {
  it('reads a linear chain (bulbasaur → ivysaur → venusaur)', async () => {
    server.use(http.get(`${API}/evolution-chain/1`, () => HttpResponse.json(chainBulbasaur)))

    const { chain } = await getEvolutionChain(1)

    expect(chain.species.name).toBe('bulbasaur')
    expect(chain.evolves_to.map((link) => link.species.name)).toEqual(['ivysaur'])
    expect(chain.evolves_to[0]?.evolves_to.map((link) => link.species.name)).toEqual(['venusaur'])
  })

  it('reads a chain that branches at the first step (eevee has 8 evolutions)', async () => {
    server.use(http.get(`${API}/evolution-chain/67`, () => HttpResponse.json(chainEevee)))

    const { chain } = await getEvolutionChain(67)

    expect(chain.evolves_to).toHaveLength(8)
  })

  it('reads a chain that branches at a later step (gloom → vileplume or bellossom)', async () => {
    server.use(http.get(`${API}/evolution-chain/18`, () => HttpResponse.json(chainOddish)))

    const { chain } = await getEvolutionChain(18)

    expect(chain.evolves_to[0]?.evolves_to.map((link) => link.species.name)).toEqual(['vileplume', 'bellossom'])
  })

  it('checks links deep inside the chain, not just the first one', async () => {
    const gloom = chainOddish.chain.evolves_to[0]
    const brokenDeepLink = {
      ...chainOddish,
      chain: { ...chainOddish.chain, evolves_to: [{ ...gloom, evolves_to: [{ is_baby: false, evolves_to: [] }] }] },
    }
    server.use(http.get(`${API}/evolution-chain/18`, () => HttpResponse.json(brokenDeepLink)))

    expect(await errorFrom(getEvolutionChain(18))).toMatchObject({ kind: 'invalid-response' })
  })
})

describe('getType', () => {
  it('keeps the damage taken from other types', async () => {
    server.use(http.get(`${API}/type/steel`, () => HttpResponse.json(typeSteel)))

    const type = await getType('steel')

    expect(type.damage_relations.no_damage_from.map((other) => other.name)).toEqual(['poison'])
  })
})

describe('request timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it(`throws a timeout ApiError when PokéAPI takes longer than ${REQUEST_TIMEOUT_MS / 1000} seconds`, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    server.use(
      http.get(`${API}/type/steel`, async () => {
        await delay('infinite')
        return HttpResponse.json(typeSteel)
      }),
    )

    const request = errorFrom(getType('steel'))
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)

    expect(await request).toMatchObject({ name: 'ApiError', kind: 'timeout' })
  })

  it('does not time out a request that answers in time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    server.use(http.get(`${API}/type/steel`, () => HttpResponse.json(typeSteel)))

    await expect(getType('steel')).resolves.toHaveProperty('name', 'steel')
    // The timer was cleared, so nothing is left to fire later
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports a cancel by the caller as AbortError, not as a timeout', async () => {
    server.use(
      http.get(`${API}/type/steel`, async () => {
        await delay('infinite')
        return HttpResponse.json(typeSteel)
      }),
    )
    const controller = new AbortController()

    const request = errorFrom(getType('steel', controller.signal))
    controller.abort()

    expect(await request).toMatchObject({ name: 'AbortError' })
  })
})
