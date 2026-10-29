import { describe, expect, it } from 'vitest'
import { formatPokemonNumber } from './format.ts'

describe('formatPokemonNumber', () => {
  it('pads the number to four digits', () => {
    expect(formatPokemonNumber(1)).toBe('#0001')
    expect(formatPokemonNumber(25)).toBe('#0025')
    expect(formatPokemonNumber(1025)).toBe('#1025')
  })
})
