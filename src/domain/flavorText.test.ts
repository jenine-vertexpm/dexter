import { describe, expect, it } from 'vitest'
import speciesDeoxys from '../test/fixtures/species-deoxys.json'
import speciesEevee from '../test/fixtures/species-eevee.json'
import { cleanFlavorText, pickEnglishFlavorText } from './flavorText.ts'

describe('cleanFlavorText', () => {
  it('turns the line breaks and page breaks of a real entry into single spaces', () => {
    // Eevee's text from Pokémon Red, exactly as PokéAPI returns it
    const raw = 'Its genetic code\nis irregular.\nIt may mutate if\fit is exposed to\nradiation from\nelement STONEs.'

    expect(cleanFlavorText(raw)).toBe(
      'Its genetic code is irregular. It may mutate if it is exposed to radiation from element STONEs.',
    )
  })

  it('joins a word split across lines by a soft hyphen', () => {
    expect(cleanFlavorText('It can evo­\nlve in many ways.')).toBe('It can evolve in many ways.')
  })

  it('collapses repeated spaces and trims the ends', () => {
    expect(cleanFlavorText('  Two   spaces \n ')).toBe('Two spaces')
  })
})

describe('pickEnglishFlavorText', () => {
  it('picks the English entry from the newest game and cleans it', () => {
    // Eevee's fixture has English entries from Red (1), Blue (2) and Yellow (3)
    expect(pickEnglishFlavorText(speciesEevee.flavor_text_entries)).toBe(
      'Its genetic code is unstable, so it could evolve in a variety of ways. There are only a few alive.',
    )
  })

  it('ignores newer entries in other languages', () => {
    // Deoxys' fixture: English from Ruby, Sapphire and Emerald, plus French from Black (a newer game)
    expect(pickEnglishFlavorText(speciesDeoxys.flavor_text_entries)).toBe(
      'A POKéMON that mutated from an extraterrestrial virus exposed to a laser beam. ' +
        'Its body is configured for superior agility and speed.',
    )
  })

  it('returns null when there is no English entry', () => {
    const frenchOnly = speciesEevee.flavor_text_entries.filter((entry) => entry.language.name !== 'en')

    expect(pickEnglishFlavorText(frenchOnly)).toBeNull()
  })
})
