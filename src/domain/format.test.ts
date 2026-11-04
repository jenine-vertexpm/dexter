import { describe, expect, it } from 'vitest'
import { formatMultiplier, formatName, formatPokemonNumber, formatStatName } from './format.ts'
import type { Multiplier } from './matchups.ts'

describe('formatPokemonNumber', () => {
  it('pads the number to four digits', () => {
    expect(formatPokemonNumber(1)).toBe('#0001')
    expect(formatPokemonNumber(25)).toBe('#0025')
    expect(formatPokemonNumber(1025)).toBe('#1025')
  })
})

describe('formatName', () => {
  it('turns hyphens into spaces', () => {
    expect(formatName('run-away')).toBe('run away')
    expect(formatName('adaptability')).toBe('adaptability')
  })
})

describe('formatStatName', () => {
  it('gives each stat a readable label', () => {
    expect(formatStatName('hp')).toBe('HP')
    expect(formatStatName('special-defense')).toBe('Special Defense')
  })

  it('still gives an unexpected stat a readable label', () => {
    expect(formatStatName('new-stat')).toBe('new stat')
  })
})

describe('formatMultiplier', () => {
  it('writes every multiplier as text', () => {
    expect([0, 0.25, 0.5, 1, 2, 4].map((value) => formatMultiplier(value as Multiplier))).toEqual([
      '0×',
      '¼×',
      '½×',
      '1×',
      '2×',
      '4×',
    ])
  })
})
