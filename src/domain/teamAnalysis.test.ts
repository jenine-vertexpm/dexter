import { describe, expect, it } from 'vitest'
import type { ApiType } from '../api/schemas.ts'
import pokemonEevee from '../test/fixtures/pokemon-133-eevee.json'
import pokemonScizor from '../test/fixtures/pokemon-212-scizor.json'
import pokemonDeoxys from '../test/fixtures/pokemon-386-deoxys-normal.json'
import typeBug from '../test/fixtures/type-bug.json'
import typeNormal from '../test/fixtures/type-normal.json'
import typePsychic from '../test/fixtures/type-psychic.json'
import typeSteel from '../test/fixtures/type-steel.json'
import { BATTLE_TYPES } from './battleTypes.ts'
import { analyzeTeam, type AnalysisMember, type TypeCoverage } from './teamAnalysis.ts'

// Real Pokémon from the fixtures, with their real types and base stats
function fromFixture(pokemon: typeof pokemonEevee, types: ApiType[]): AnalysisMember {
  return { types, stats: pokemon.stats.map((entry) => ({ name: entry.stat.name, value: entry.base_stat })) }
}
const eevee = fromFixture(pokemonEevee, [typeNormal])
const scizor = fromFixture(pokemonScizor, [typeBug, typeSteel])
const deoxys = fromFixture(pokemonDeoxys, [typePsychic])

// A member with only types, for the highlight tests. Psychic takes 2× from bug, ghost and dark;
// normal takes 0× from ghost; steel takes ½× from bug (all from the real type fixtures).
function ofType(...types: ApiType[]): AnalysisMember {
  return { types, stats: [] }
}
const psychic = ofType(typePsychic)

// Turns the 18 rows into { fire: {...}, ghost: {...}, ... } so tests can look types up by name
function byType(coverage: TypeCoverage[]): Record<string, TypeCoverage> {
  return Object.fromEntries(coverage.map((row) => [row.attackingType, row]))
}

function highlightedTypes(members: AnalysisMember[]): string[] {
  return analyzeTeam(members)
    .coverage.filter((row) => row.highlighted)
    .map((row) => row.attackingType)
}

describe('analyzeTeam: counts', () => {
  it('has one row for each of the 18 battle types, in order', () => {
    const { coverage } = analyzeTeam([eevee, scizor])

    expect(coverage.map((row) => row.attackingType)).toEqual([...BATTLE_TYPES])
  })

  it('counts a single-type member (Eevee, normal): weak to fighting, immune to ghost', () => {
    const rows = byType(analyzeTeam([eevee]).coverage)

    expect(rows.fighting).toMatchObject({ weak: 1, resist: 0, immune: 0 })
    expect(rows.ghost).toMatchObject({ weak: 0, resist: 0, immune: 1 })
    // Neutral (1×) counts nowhere
    expect(rows.water).toMatchObject({ weak: 0, resist: 0, immune: 0 })
  })

  it('counts a dual-type member (Scizor, bug/steel) from the combined multiplier', () => {
    const rows = byType(analyzeTeam([scizor]).coverage)

    expect(rows.grass).toMatchObject({ weak: 0, resist: 1, immune: 0 }) // ¼×
    expect(rows.poison).toMatchObject({ weak: 0, resist: 0, immune: 1 }) // 0×
    expect(rows.normal).toMatchObject({ weak: 0, resist: 1, immune: 0 }) // ½×
    // Bug takes ½× from fighting, steel 2×: 1× overall, so neutral
    expect(rows.fighting).toMatchObject({ weak: 0, resist: 0, immune: 0 })
  })

  it('counts Scizor’s 4× fire weakness as one weak member', () => {
    const rows = byType(analyzeTeam([scizor]).coverage)

    expect(rows.fire).toMatchObject({ weak: 1, resist: 0, immune: 0 })
  })

  it('adds up the members of a mixed team', () => {
    const rows = byType(analyzeTeam([eevee, scizor, deoxys]).coverage)

    // Fighting: Eevee 2×, Scizor 1×, Deoxys ½×
    expect(rows.fighting).toMatchObject({ weak: 1, resist: 1, immune: 0 })
    // Ghost: Eevee 0×, Scizor 1×, Deoxys 2×
    expect(rows.ghost).toMatchObject({ weak: 1, resist: 0, immune: 1 })
    // Psychic: Eevee 1×, Scizor ½×, Deoxys ½×
    expect(rows.psychic).toMatchObject({ weak: 0, resist: 2, immune: 0 })
  })
})

describe('analyzeTeam: shared weakness highlight (D15)', () => {
  it('3 weak, 0 resist, 0 immune → highlighted', () => {
    const rows = byType(analyzeTeam([psychic, psychic, psychic]).coverage)

    expect(rows.ghost).toMatchObject({ weak: 3, resist: 0, immune: 0, highlighted: true })
    expect(highlightedTypes([psychic, psychic, psychic])).toEqual(['bug', 'ghost', 'dark'])
  })

  it('3 weak + 1 resist → not highlighted', () => {
    const team = [psychic, psychic, psychic, ofType(typeSteel)]
    const rows = byType(analyzeTeam(team).coverage)

    expect(rows.bug).toMatchObject({ weak: 3, resist: 1, immune: 0, highlighted: false })
    // Steel doesn't cover ghost or dark, so those stay highlighted
    expect(highlightedTypes(team)).toEqual(['ghost', 'dark'])
  })

  it('3 weak + 1 immune → not highlighted: immunity counts as protection', () => {
    const team = [psychic, psychic, psychic, ofType(typeNormal)]
    const rows = byType(analyzeTeam(team).coverage)

    expect(rows.ghost).toMatchObject({ weak: 3, resist: 0, immune: 1, highlighted: false })
    expect(highlightedTypes(team)).toEqual(['bug', 'dark'])
  })

  it('2 weak → not highlighted', () => {
    const rows = byType(analyzeTeam([psychic, psychic]).coverage)

    expect(rows.ghost).toMatchObject({ weak: 2, highlighted: false })
    expect(highlightedTypes([psychic, psychic])).toEqual([])
  })
})

describe('analyzeTeam: average base stats', () => {
  it('averages each stat over the members (Eevee and Deoxys)', () => {
    // Eevee 55/55/50/45/65/55, Deoxys 50/150/50/150/50/150
    expect(analyzeTeam([eevee, deoxys]).averageStats).toEqual([
      { name: 'hp', value: 52.5 },
      { name: 'attack', value: 102.5 },
      { name: 'defense', value: 50 },
      { name: 'special-attack', value: 97.5 },
      { name: 'special-defense', value: 57.5 },
      { name: 'speed', value: 102.5 },
    ])
  })

  it('rounds to 1 decimal, up and down (Eevee, Deoxys and Scizor)', () => {
    // Scizor 70/130/100/55/80/65. HP 175 / 3 = 58.33… → 58.3; attack 335 / 3 = 111.66… → 111.7
    expect(analyzeTeam([eevee, deoxys, scizor]).averageStats).toEqual([
      { name: 'hp', value: 58.3 },
      { name: 'attack', value: 111.7 },
      { name: 'defense', value: 66.7 },
      { name: 'special-attack', value: 83.3 },
      { name: 'special-defense', value: 65 },
      { name: 'speed', value: 90 },
    ])
  })
})

describe('analyzeTeam: team size', () => {
  it('works for a one-member team: its own stats, its own matchups, nothing highlighted', () => {
    const analysis = analyzeTeam([eevee])

    expect(analysis.averageStats.map((stat) => stat.value)).toEqual([55, 55, 50, 45, 65, 55])
    expect(analysis.coverage.every((row) => row.weak + row.resist + row.immune <= 1)).toBe(true)
    expect(analysis.coverage.some((row) => row.highlighted)).toBe(false)
  })

  it('refuses an empty team: it has no analysis', () => {
    expect(() => analyzeTeam([])).toThrow(RangeError)
  })
})
