import { describe, expect, it } from 'vitest'
import { idFromUrl } from './resourceId.ts'

describe('idFromUrl', () => {
  it('reads the id at the end of a PokéAPI URL', () => {
    expect(idFromUrl('https://pokeapi.co/api/v2/pokemon-species/133/')).toBe(133)
    expect(idFromUrl('https://pokeapi.co/api/v2/pokemon/10004/')).toBe(10004)
  })

  it('accepts a URL without the trailing slash', () => {
    expect(idFromUrl('https://pokeapi.co/api/v2/type/9')).toBe(9)
  })

  it('returns null when there is no positive whole number at the end', () => {
    expect(idFromUrl('https://pokeapi.co/api/v2/pokemon/eevee/')).toBeNull()
    expect(idFromUrl('https://pokeapi.co/api/v2/pokemon/0/')).toBeNull()
    expect(idFromUrl('')).toBeNull()
  })
})
