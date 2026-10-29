import type { ApiSpecies } from '../api/schemas.ts'
import { idFromUrl } from './resourceId.ts'

type FlavorTextEntry = ApiSpecies['flavor_text_entries'][number]

// One English description: the one from the newest game (highest version id), cleaned up.
// Returns null if the species has no English text.
export function pickEnglishFlavorText(entries: readonly FlavorTextEntry[]): string | null {
  let newest: FlavorTextEntry | null = null
  let newestVersionId = -1
  for (const entry of entries) {
    if (entry.language.name !== 'en') continue
    const versionId = idFromUrl(entry.version.url) ?? 0
    if (versionId > newestVersionId) {
      newest = entry
      newestVersionId = versionId
    }
  }
  return newest ? cleanFlavorText(newest.flavor_text) : null
}

// The raw text keeps the line breaks of the original game screens: \n, \f (form feed, a "next page")
// and soft hyphens (­) where a word was split across lines.
export function cleanFlavorText(text: string): string {
  return text
    .replace(/­\s*/g, '') // join words split by a soft hyphen
    .replace(/\s+/g, ' ') // every kind of line break or repeated space becomes one space
    .trim()
}
