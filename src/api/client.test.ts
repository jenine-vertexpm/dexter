import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server.ts'
import { ApiError, getPokemon } from './client.ts'

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
