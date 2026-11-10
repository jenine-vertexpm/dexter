// Smoke test against the REAL PokéAPI (M4 plan H9, §5.4, D27). Run with `npm run smoke`.
//
// Every other test uses recorded or fake answers, so it would stay green even if PokéAPI changed.
// This file asks the live API whether it still matches what Dexter relies on. It goes through our
// own client and schemas (src/api), so it checks the same code path the app uses. About 8 requests.
//
// It runs daily in .github/workflows/smoke.yml, never on pull requests, so a PokéAPI outage or
// change warns us without ever blocking a merge. `npm test` doesn't run it (see vitest.smoke.config.ts).
import { beforeAll, describe, expect, it } from 'vitest'
import {
  ApiError,
  getEvolutionChain,
  getPokemon,
  getPokemonById,
  getSpecies,
  getSpeciesIndex,
  getType,
} from '../src/api/client.ts'
import { speciesIndexSchema, type ApiSpeciesIndex } from '../src/api/schemas.ts'
import { toEvolutionTree } from '../src/domain/evolution.ts'
import { toPokemonSummary } from '../src/domain/pokemon.ts'
import { idFromUrl } from '../src/domain/resourceId.ts'
import { toSpeciesEntries, type SpeciesEntry } from '../src/domain/speciesList.ts'

// The number of species when Dexter was built. New games only ever add species.
const SPECIES_COUNT_AT_BUILD = 1025
// The only image host allowed by our Content Security Policy (img-src in nginx/security-headers.inc.template)
const ARTWORK_PREFIX = 'https://raw.githubusercontent.com/'

let species: SpeciesEntry[]

beforeAll(async () => {
  species = toSpeciesEntries(await getSpeciesIndex())
})

// 1. The list, search and pagination all run on this one answer
it('the species index parses with our schema and still has every species', () => {
  expect(
    species.length,
    `Expected at least ${SPECIES_COUNT_AT_BUILD} species with a usable id; PokéAPI returned ${species.length}`,
  ).toBeGreaterThanOrEqual(SPECIES_COUNT_AT_BUILD)
})

// 2. Assumption A1 (M2 plan §5): "species id N = default Pokémon id N". Never documented by PokéAPI,
//    only observed. List cards load Pokémon by the species id, and the type filter maps Pokémon to
//    species by id. Cards have a runtime fallback if it breaks; the type filter doesn't, which is
//    why this check exists.
it('A1: for every species id N, Pokémon id N exists and is that species (name, or name-<form>)', async () => {
  // The app never loads the full Pokémon list, so there's no client function for it. It has
  // exactly the same shape as the species index ({ count, results: [{ name, url }] }), so the same
  // schema checks it, including that the list wasn't cut short.
  const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=100000')
  expect(response.ok, `GET /pokemon?limit=100000 answered HTTP ${response.status}`).toBe(true)
  const pokemonIndex: ApiSpeciesIndex = speciesIndexSchema.parse(await response.json())

  const pokemonNameById = new Map<number, string>()
  for (const result of pokemonIndex.results) {
    const id = idFromUrl(result.url)
    if (id !== null) pokemonNameById.set(id, result.name)
  }

  const broken: string[] = []
  for (const { id, name } of species) {
    const pokemonName = pokemonNameById.get(id)
    if (pokemonName === undefined) broken.push(`species #${id} ${name}: no Pokémon #${id}`)
    else if (pokemonName !== name && !pokemonName.startsWith(`${name}-`)) {
      broken.push(`species #${id} ${name}: Pokémon #${id} is "${pokemonName}"`)
    }
  }

  expect(
    broken,
    `A1 no longer holds for ${broken.length} species. Cards fall back safely, but the type filter maps by id and could show the wrong species`,
  ).toEqual([])
})

// 3. The detail page: Pokémon, species and evolution chain, on the branchiest chain there is
describe('eevee', () => {
  it('the Pokémon, species and evolution chain parse, and the chain still branches 8 ways', async () => {
    const [pokemon, eeveeSpecies] = await Promise.all([getPokemon('eevee'), getSpecies('eevee')])
    expect(pokemon.species.name).toBe('eevee')

    const chainId = eeveeSpecies.evolution_chain === null ? null : idFromUrl(eeveeSpecies.evolution_chain.url)
    expect(chainId, 'eevee species has no usable evolution_chain url').not.toBeNull()

    const tree = toEvolutionTree(await getEvolutionChain(chainId!))
    expect(tree.name).toBe('eevee')
    expect(
      tree.evolvesTo.map((node) => node.name),
      'eevee should evolve 8 ways (the detail page shows each as a link)',
    ).toHaveLength(8)
  })
})

// 4. The type filter: a type lists Pokémon, including alternate forms (ids above 10000), which
//    the filter drops because they aren't species (speciesIdsWithType). If forms disappeared or
//    moved below 10000, that rule would need another look.
it('type/fire parses and still lists alternate forms with ids above 10000', async () => {
  const fire = await getType('fire')
  const ids = fire.pokemon.map((entry) => idFromUrl(entry.pokemon.url))
  expect(ids.filter((id) => id !== null && id > 10000).length, 'no alternate forms in type/fire').toBeGreaterThan(0)
  expect(ids.filter((id) => id !== null && id <= SPECIES_COUNT_AT_BUILD).length).toBeGreaterThan(0)
})

// 5. A misspelt name must show the not-found page, not an error with a Retry button
it('an unknown species is reported by our client as not-found', async () => {
  const error = await getSpecies('pikachuu').catch((caught: unknown) => caught)
  expect(error, 'expected getSpecies("pikachuu") to fail').toBeInstanceOf(ApiError)
  expect((error as ApiError).kind, `expected kind "not-found", got: ${String(error)}`).toBe('not-found')
})

// 6. Artwork must come from the one image host our CSP allows. If PokéAPI moves its images,
//    img-src in nginx/security-headers.inc.template has to change too, or every image is blocked.
it('artwork URLs still point at the host our CSP allows', async () => {
  // Pokémon #1 by id, exactly as a list card loads it, and eevee by name, as the detail page does
  const [bulbasaur, eevee] = await Promise.all([getPokemonById(1), getPokemon('eevee')])
  for (const pokemon of [bulbasaur, eevee]) {
    const { artworkUrl } = toPokemonSummary(pokemon, pokemon.id)
    expect(
      artworkUrl,
      `${pokemon.name}'s artwork is not on ${ARTWORK_PREFIX}: update img-src in nginx/security-headers.inc.template`,
    ).toMatch(new RegExp(`^${ARTWORK_PREFIX.replaceAll('.', '\\.')}`))
  }
})
