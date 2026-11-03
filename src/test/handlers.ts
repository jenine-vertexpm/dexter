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

// A type in PokéAPI's shape, with these Pokémon ids as members. Damage relations are empty
// because the list filter doesn't read them.
export function fakeType(name: string, ids: readonly number[]) {
  return {
    id: 1,
    name,
    damage_relations: { no_damage_from: [], half_damage_from: [], double_damage_from: [] },
    pokemon: ids.map((id) => ({ slot: 1, pokemon: { name: `pokemon-${id}`, url: `${API}/pokemon/${id}/` } })),
  }
}

// Type members for the list tests, using species in the 46-species fixture index. Real types,
// trimmed to those species, plus one alternate form (id above 10000) that must be dropped.
export const LIST_TYPES: Record<string, number[]> = {
  fire: [4, 5, 6, 136, 10034], // charmander, charmeleon, charizard, flareon, mega charizard x
  flying: [6, 12, 16, 17, 18, 21, 22], // charizard, butterfree, pidgey, pidgeotto, pidgeot, spearow, fearow
  water: [7, 8, 9, 134], // squirtle, wartortle, blastoise, vaporeon
}

// Answers the requests the list page makes: the species index, Pokémon by number, and types.
// Returns counters so tests can check how many requests were made.
export function listHandlers() {
  const counts = { index: 0, pokemon: new Map<string, number>(), types: new Map<string, number>() }
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
      http.get(`${API}/type/:name`, ({ params }) => {
        const name = String(params.name)
        counts.types.set(name, (counts.types.get(name) ?? 0) + 1)
        const ids = LIST_TYPES[name]
        return ids ? HttpResponse.json(fakeType(name, ids)) : new HttpResponse(null, { status: 404 })
      }),
    ],
  }
}
