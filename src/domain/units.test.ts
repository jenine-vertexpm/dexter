import { describe, expect, it } from 'vitest'
import { decimetresToMetres, hectogramsToKilograms } from './units.ts'

// Real values: Eevee is 3 dm / 65 hg, Scizor 18 dm / 1180 hg, Deoxys 17 dm / 608 hg
describe('decimetresToMetres', () => {
  it('converts PokéAPI heights to metres', () => {
    expect(decimetresToMetres(3)).toBe(0.3)
    expect(decimetresToMetres(18)).toBe(1.8)
    expect(decimetresToMetres(17)).toBe(1.7)
  })
})

describe('hectogramsToKilograms', () => {
  it('converts PokéAPI weights to kilograms', () => {
    expect(hectogramsToKilograms(65)).toBe(6.5)
    expect(hectogramsToKilograms(1180)).toBe(118)
    expect(hectogramsToKilograms(608)).toBe(60.8)
  })
})
