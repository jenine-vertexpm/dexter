import { describe, expect, it } from 'vitest'
import type { ApiType } from '../api/schemas.ts'
import speciesIndex from '../test/fixtures/species-index.json'
import typeBug from '../test/fixtures/type-bug.json'
import { PAGE_SIZE, queryList, speciesIdsWithType, toSpeciesEntries, type ListQuery } from './speciesList.ts'

// The fixture index holds 46 real species: 1–30, the oddish and eevee families, scizor, deoxys, pecharunt…
const entries = toSpeciesEntries(speciesIndex)
const allIds = new Set(entries.map((entry) => entry.id))
const noFilter: ListQuery = { search: '', typeFilters: [], page: 1 }

const names = (query: ListQuery) => queryList(entries, query).items.map((entry) => entry.name)

// A type whose Pokémon list contains these (name, id) pairs. Damage relations don't matter here.
function typeWithPokemon(pokemon: [string, number][]): ApiType {
  return {
    id: 1,
    name: 'test-type',
    damage_relations: { no_damage_from: [], half_damage_from: [], double_damage_from: [] },
    pokemon: pokemon.map(([name, id]) => ({ slot: 1, pokemon: { name, url: `https://pokeapi.co/api/v2/pokemon/${id}/` } })),
  }
}

describe('toSpeciesEntries', () => {
  it('turns the index into numbered entries, sorted by number', () => {
    expect(entries).toHaveLength(46)
    expect(entries[0]).toEqual({ id: 1, name: 'bulbasaur' })
    expect(entries.at(-1)).toEqual({ id: 1025, name: 'pecharunt' })
  })

  it('drops an entry whose link has no id', () => {
    const broken = { count: 2, results: [...speciesIndex.results.slice(0, 1), { name: 'odd', url: 'not-a-link' }] }

    expect(toSpeciesEntries(broken)).toEqual([{ id: 1, name: 'bulbasaur' }])
  })
})

describe('speciesIdsWithType', () => {
  it('keeps species and drops alternate forms (ids above 10000)', () => {
    // The real bug type list: caterpie, metapod, butterfree, weedle and the form wormadam-sandy (10004)
    expect(speciesIdsWithType(typeBug, allIds)).toEqual(new Set([10, 11, 12, 13]))
  })

  it('maps a default Pokémon with a different name to its species by id (deoxys-normal → deoxys)', () => {
    const psychicLike = typeWithPokemon([
      ['deoxys-normal', 386],
      ['deoxys-attack', 10001],
    ])

    const ids = speciesIdsWithType(psychicLike, allIds)

    expect(ids).toEqual(new Set([386]))
    expect(names({ ...noFilter, typeFilters: [ids] })).toEqual(['deoxys'])
  })
})

describe('queryList', () => {
  it('shows the first 20 species on page 1', () => {
    const result = queryList(entries, noFilter)

    expect(result.items).toHaveLength(PAGE_SIZE)
    expect(result.items[0]?.name).toBe('bulbasaur')
    expect(result.items.at(-1)?.name).toBe('raticate') // number 20
    expect(result.total).toBe(46)
    expect(result.totalPages).toBe(3)
  })

  it('shows the remaining species on the last page', () => {
    // Entries 41 to 46 of the fixture
    expect(names({ ...noFilter, page: 3 })).toEqual(['scizor', 'deoxys', 'leafeon', 'glaceon', 'sylveon', 'pecharunt'])
  })

  it('returns no items for a page past the end, but still the totals', () => {
    const result = queryList(entries, { ...noFilter, page: 4 })

    expect(result.items).toEqual([])
    expect(result.total).toBe(46)
    expect(result.totalPages).toBe(3)
  })

  it('matches part of a name, ignoring case and surrounding spaces', () => {
    expect(names({ ...noFilter, search: 'PIK' })).toEqual(['pikachu'])
    // Matches anywhere in the name, so "pecharunt" counts too
    expect(names({ ...noFilter, search: ' char ' })).toEqual(['charmander', 'charmeleon', 'charizard', 'pecharunt'])
  })

  it('returns nothing, with zero pages, when no name matches', () => {
    expect(queryList(entries, { ...noFilter, search: 'pikachuu' })).toEqual({ items: [], total: 0, totalPages: 0 })
  })

  it('filters by one type', () => {
    expect(names({ ...noFilter, typeFilters: [speciesIdsWithType(typeBug, allIds)] })).toEqual([
      'caterpie',
      'metapod',
      'butterfree',
      'weedle',
    ])
  })

  it('with two types, keeps only species that have both', () => {
    const bug = new Set([10, 11, 12, 13, 212])
    const steel = new Set([212, 386])

    expect(names({ ...noFilter, typeFilters: [bug, steel] })).toEqual(['scizor'])
  })

  it('combines search with a type filter', () => {
    const bug = speciesIdsWithType(typeBug, allIds)

    expect(names({ ...noFilter, search: 'ter', typeFilters: [bug] })).toEqual(['caterpie', 'butterfree'])
    // "pie" matches caterpie only; with the bug filter it still does
    expect(names({ ...noFilter, search: 'pie', typeFilters: [bug] })).toEqual(['caterpie'])
    // "char" matches four species, none of them bug type
    expect(names({ ...noFilter, search: 'char', typeFilters: [bug] })).toEqual([])
  })
})
