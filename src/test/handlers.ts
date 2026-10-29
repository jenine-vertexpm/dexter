import { http, HttpResponse } from 'msw'
import speciesIndex from './fixtures/species-index.json'

export const API = 'https://pokeapi.co/api/v2'

const indexNameById = new Map(
  speciesIndex.results.map((result) => [Number(result.url.split('/').at(-2)), result.name]),
)

// A minimal Pokémon in PokéAPI's shape. Real fixtures cover the tricky cases (deoxys, scizor);
// this fills the other cards on a page so each test doesn't need 20 hand-made responses.
export function fakePokemon(id: number, name: string, speciesName = name) {
  return {
    id,
    name,
    height: 10,
    weight: 100,
    types: [{ slot: 1, type: { name: 'normal', url: `${API}/type/1/` } }],
    stats: [],
    abilities: [],
    sprites: { other: { 'official-artwork': { front_default: `https://img.example/${id}.png` } } },
    species: { name: speciesName, url: `${API}/pokemon-species/${id}/` },
  }
}

// Answers the requests the list page makes: the species index, and Pokémon by number.
// Returns counters so tests can check how many requests were made.
export function listHandlers() {
  const counts = { index: 0, pokemon: new Map<string, number>() }
  return {
    counts,
    handlers: [
      http.get(`${API}/pokemon-species`, () => {
        counts.index += 1
        return HttpResponse.json(speciesIndex)
      }),
      http.get(`${API}/pokemon/:idOrName`, ({ params }) => {
        const key = String(params.idOrName)
        counts.pokemon.set(key, (counts.pokemon.get(key) ?? 0) + 1)
        const name = indexNameById.get(Number(key))
        return name ? HttpResponse.json(fakePokemon(Number(key), name)) : new HttpResponse(null, { status: 404 })
      }),
    ],
  }
}
