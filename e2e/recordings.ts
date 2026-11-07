import { fileURLToPath } from 'node:url'

// Where recorded PokéAPI answers are kept, and how a request's URL maps to a file there.
// Used by the recorder (e2e/record.ts) to save answers and by the test fixture (e2e/fixtures.ts)
// to find them again, so both always agree on the file name.

export const API_ORIGIN = 'https://pokeapi.co'
export const API_PREFIX = '/api/v2/'

export const RECORDINGS_DIR = fileURLToPath(new URL('./fixtures/api/', import.meta.url))

// One saved answer: the HTTP status and the JSON body (already trimmed by our zod schemas)
export interface Recording {
  status: number
  body: unknown
}

// The file for a PokéAPI URL, relative to RECORDINGS_DIR. The path becomes folders, and the query
// is added to the name with "__" (a "?" isn't allowed in Windows file names):
//   https://pokeapi.co/api/v2/pokemon/25                    → pokemon/25.json
//   https://pokeapi.co/api/v2/pokemon-species?limit=100000  → pokemon-species__limit=100000.json
// Returns null for a URL that isn't a PokéAPI v2 URL.
export function recordingFileFor(url: string): string | null {
  const { origin, pathname, search } = new URL(url)
  if (origin !== API_ORIGIN || !pathname.startsWith(API_PREFIX)) return null
  const path = decodeURIComponent(pathname.slice(API_PREFIX.length)).replace(/\/$/, '')
  // Only plain names and numbers, so a URL can never point outside the recordings folder
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(path)) return null
  const query = search === '' ? '' : `__${search.slice(1).replaceAll('&', '_')}`
  if (!/^[a-z0-9_=-]*$/.test(query)) return null
  return `${path}${query}.json`
}
