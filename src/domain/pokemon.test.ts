import { describe, expect, it } from 'vitest'
import deoxysNormal from '../test/fixtures/pokemon-386-deoxys-normal.json'
import scizor from '../test/fixtures/pokemon-212-scizor.json'
import speciesDeoxys from '../test/fixtures/species-deoxys.json'
import { belongsToSpecies, defaultVarietyName, toPokemonDetail, toPokemonSummary } from './pokemon.ts'

describe('belongsToSpecies (the A1 safeguard)', () => {
  it('accepts a Pokémon that belongs to the expected species, even with a different name', () => {
    // Pokémon 386 is "deoxys-normal", the default form of species 386 "deoxys"
    expect(belongsToSpecies(deoxysNormal, 'deoxys')).toBe(true)
  })

  it('rejects a Pokémon that belongs to another species', () => {
    expect(belongsToSpecies(deoxysNormal, 'eevee')).toBe(false)
  })
})

describe('defaultVarietyName', () => {
  it('finds the default Pokémon of a species', () => {
    expect(defaultVarietyName(speciesDeoxys)).toBe('deoxys-normal')
  })

  it('returns null when no variety is marked default', () => {
    const noDefault = {
      ...speciesDeoxys,
      varieties: speciesDeoxys.varieties.map((variety) => ({ ...variety, is_default: false })),
    }

    expect(defaultVarietyName(noDefault)).toBeNull()
  })
})

describe('toPokemonSummary', () => {
  it('uses the species number and name, the artwork and the types in game order', () => {
    expect(toPokemonSummary(scizor, 212)).toEqual({
      id: 212,
      name: 'scizor',
      artworkUrl: scizor.sprites.other['official-artwork'].front_default,
      types: ['bug', 'steel'],
    })
  })

  it('names a Pokémon after its species (deoxys, not deoxys-normal)', () => {
    expect(toPokemonSummary(deoxysNormal, 386).name).toBe('deoxys')
  })

  it('orders types by slot even if PokéAPI lists them the other way round', () => {
    const reversed = { ...scizor, types: [...scizor.types].reverse() }

    expect(toPokemonSummary(reversed, 212).types).toEqual(['bug', 'steel'])
  })

  it('keeps missing artwork as null', () => {
    const noArtwork = { ...scizor, sprites: { other: { 'official-artwork': { front_default: null } } } }

    expect(toPokemonSummary(noArtwork, 212).artworkUrl).toBeNull()
  })
})

describe('toPokemonDetail', () => {
  const detail = toPokemonDetail(deoxysNormal, speciesDeoxys)

  it('converts height and weight to metres and kilograms', () => {
    expect(detail.heightMetres).toBe(1.7)
    expect(detail.weightKilograms).toBe(60.8)
  })

  it('keeps every base stat with its number', () => {
    expect(detail.stats).toHaveLength(6)
    expect(detail.stats[0]).toEqual({ name: 'hp', value: deoxysNormal.stats[0]?.base_stat })
  })

  it('marks hidden abilities', () => {
    const scizorDetail = toPokemonDetail(scizor, { ...speciesDeoxys, id: 212, name: 'scizor' })

    expect(scizorDetail.abilities).toEqual([
      { name: 'swarm', isHidden: false },
      { name: 'technician', isHidden: false },
      { name: 'light-metal', isHidden: true },
    ])
  })

  it('includes the cleaned English description', () => {
    expect(detail.description).toMatch(/^A POKéMON that mutated from an extraterrestrial virus/)
    expect(detail.description).not.toMatch(/[\n\f]/)
  })

  it('reads the evolution chain id from the species', () => {
    expect(detail.evolutionChainId).toBe(202)
  })

  it('has no evolution chain id when the species has no chain', () => {
    expect(toPokemonDetail(deoxysNormal, { ...speciesDeoxys, evolution_chain: null }).evolutionChainId).toBeNull()
  })
})
