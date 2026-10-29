import { describe, expect, it } from 'vitest'
import typeBug from '../test/fixtures/type-bug.json'
import typeSteel from '../test/fixtures/type-steel.json'
import { BATTLE_TYPES } from './battleTypes.ts'
import { getMatchups, type Matchup } from './matchups.ts'

// Turns the list into { fire: 4, grass: 0.25, ... } so tests can look types up by name
function byType(matchups: Matchup[]): Record<string, number> {
  return Object.fromEntries(matchups.map((matchup) => [matchup.attackingType, matchup.multiplier]))
}

describe('getMatchups', () => {
  it('lists every battle type exactly once, in order', () => {
    const matchups = getMatchups([typeSteel])

    expect(matchups.map((matchup) => matchup.attackingType)).toEqual([...BATTLE_TYPES])
    expect(matchups).toHaveLength(18)
  })

  it('uses a single type’s damage relations directly (steel)', () => {
    const steel = byType(getMatchups([typeSteel]))

    expect(steel.fire).toBe(2)
    expect(steel.normal).toBe(0.5)
    expect(steel.poison).toBe(0)
    expect(steel.water).toBe(1)
  })

  // Scizor is bug/steel; the expected values are what the real data in the fixtures produces
  describe('dual type (bug/steel, like Scizor)', () => {
    const scizor = byType(getMatchups([typeBug, typeSteel]))

    it('multiplies two weaknesses: fire 2 × 2 = 4×', () => {
      expect(scizor.fire).toBe(4)
    })

    it('multiplies two resistances: grass ½ × ½ = ¼×', () => {
      expect(scizor.grass).toBe(0.25)
    })

    it('lets an immunity win: poison 1 × 0 = 0×', () => {
      expect(scizor.poison).toBe(0)
    })

    it('lets a weakness and a resistance cancel out: fighting ½ × 2 = 1×', () => {
      expect(scizor.fighting).toBe(1)
      expect(scizor.flying).toBe(1)
    })

    it('gives the same result whichever type comes first', () => {
      expect(byType(getMatchups([typeSteel, typeBug]))).toEqual(scizor)
    })
  })

  it('only ever produces 0, ¼, ½, 1, 2 or 4', () => {
    const allowed = [0, 0.25, 0.5, 1, 2, 4]
    for (const types of [[typeBug], [typeSteel], [typeBug, typeSteel], [typeSteel, typeSteel]]) {
      for (const matchup of getMatchups(types)) {
        expect(allowed).toContain(matchup.multiplier)
      }
    }
  })

  it('refuses no types or more than two', () => {
    expect(() => getMatchups([])).toThrow(RangeError)
    expect(() => getMatchups([typeBug, typeSteel, typeBug])).toThrow(RangeError)
  })
})
