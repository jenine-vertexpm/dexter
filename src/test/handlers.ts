import { http, HttpResponse } from 'msw'
import pokemonEevee from './fixtures/pokemon-133-eevee.json'
import pokemonDeoxysNormal from './fixtures/pokemon-386-deoxys-normal.json'
import speciesDeoxys from './fixtures/species-deoxys.json'
import speciesEevee from './fixtures/species-eevee.json'
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

// A minimal species in PokéAPI's shape whose default Pokémon has the same name and number.
// No flavour text and no evolution chain: the real fixtures (deoxys, eevee) cover those.
export function fakeSpecies(id: number, name: string) {
  return {
    id,
    name,
    varieties: [{ is_default: true, pokemon: { name, url: `${API}/pokemon/${id}/` } }],
    evolution_chain: null,
    flavor_text_entries: [],
  }
}

// Real responses for the detail page tests, by name
const REAL_SPECIES: Record<string, unknown> = { deoxys: speciesDeoxys, eevee: speciesEevee }
const REAL_POKEMON: Record<string, unknown> = { 'deoxys-normal': pokemonDeoxysNormal, eevee: pokemonEevee }
const indexIdByName = new Map([...indexNameById].map(([id, name]) => [name, id]))

// Answers the requests the detail page makes: a species by name, a Pokémon by name, and the
// species index (for previous/next). Deoxys and Eevee are real responses; any other species in
// the fixture index gets a fake one. Anything else is a 404, like PokéAPI.
export function detailHandlers() {
  return [
    http.get(`${API}/pokemon-species`, () => HttpResponse.json(speciesIndex)),
    http.get(`${API}/pokemon-species/:name`, ({ params }) => {
      const name = String(params.name)
      const id = indexIdByName.get(name)
      const body = REAL_SPECIES[name] ?? (id === undefined ? undefined : fakeSpecies(id, name))
      return body ? HttpResponse.json(body) : new HttpResponse(null, { status: 404 })
    }),
    http.get(`${API}/pokemon/:name`, ({ params }) => {
      const name = String(params.name)
      const id = indexIdByName.get(name)
      // Species with a real response are not faked here: like PokéAPI, /pokemon/deoxys is a 404
      // (the Pokémon is "deoxys-normal")
      const fake = id === undefined || name in REAL_SPECIES ? undefined : fakePokemon(id, name)
      const body = REAL_POKEMON[name] ?? fake
      return body ? HttpResponse.json(body) : new HttpResponse(null, { status: 404 })
    }),
  ]
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
