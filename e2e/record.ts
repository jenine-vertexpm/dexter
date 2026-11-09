// Records the PokéAPI answers the E2E tests need (M4 plan §5.2, D20). Run by hand, never in CI:
//   npm run e2e:record
// Each URL is fetched once from the live API, one at a time, checked with our own zod schemas
// (which also drops the fields Dexter doesn't use), and saved under e2e/fixtures/api/.
// Add a URL here when a new test needs one, then note it in e2e/fixtures/README.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import {
  evolutionChainSchema,
  pokemonSchema,
  speciesIndexSchema,
  speciesSchema,
  typeSchema,
} from '../src/api/schemas.ts'
import { API_ORIGIN, API_PREFIX, RECORDINGS_DIR, recordingFileFor, type Recording } from './recordings.ts'

interface Wanted {
  path: string // after /api/v2/, exactly as the app requests it
  schema: z.ZodType
  // A deliberate "not found", e.g. a misspelt species
  expect404?: boolean
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

const WANTED: Wanted[] = [
  // Journey 1, browse and paginate: the species index, then one Pokémon per card on pages 1 and 2
  { path: 'pokemon-species?limit=100000', schema: speciesIndexSchema },
  ...range(1, 40).map((id) => ({ path: `pokemon/${id}`, schema: pokemonSchema })),

  // Journey 2, search: the cards for "char" beyond page 1 (chimchar, charjabug, charcadet, pecharunt)
  ...[390, 737, 935, 1025].map((id) => ({ path: `pokemon/${id}`, schema: pokemonSchema })),

  // Journey 3, filter: both types, and the cards with both that aren't on page 1
  // (moltres, ho-oh, fletchinder, talonflame, oricorio)
  ...['fire', 'flying'].map((name) => ({ path: `type/${name}`, schema: typeSchema })),
  ...[146, 250, 662, 663, 741].map((id) => ({ path: `pokemon/${id}`, schema: pokemonSchema })),
  // Ticking "fire" first shows page 1 of fire Pokémon for a moment, before "flying" is ticked
  ...[37, 38, 58, 59, 77, 78, 126, 136, 155, 156, 157, 218, 219, 228, 229, 240].map((id) => ({
    path: `pokemon/${id}`,
    schema: pokemonSchema,
  })),

  // Journeys 4 and 5, detail pages: eevee (deep link, its branching chain, its type matchups),
  // vaporeon (opened from the chain) and a misspelt name that must show not-found
  { path: 'evolution-chain/67', schema: evolutionChainSchema },
  { path: 'pokemon-species/pikachuu', schema: speciesSchema, expect404: true },

  // Journeys 6–8, teams: the team page loads each member by species, then its default Pokémon.
  // Species and Pokémon by name for every member and detail page above.
  ...['bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard', 'squirtle', 'eevee', 'vaporeon']
    .flatMap((name) => [
      { path: `pokemon-species/${name}`, schema: speciesSchema },
      { path: `pokemon/${name}`, schema: pokemonSchema },
    ]),
  // The members' types, for the detail pages' type matchups and the team analysis
  ...['normal', 'grass', 'poison', 'water'].map((name) => ({ path: `type/${name}`, schema: typeSchema })),

  // Request budget (H7): bulbasaur's page, opened from list page 1, also loads its chain
  { path: 'evolution-chain/1', schema: evolutionChainSchema },
]

// A pause between requests, to be polite to a free public API
const PAUSE_MS = 250

async function record({ path, schema, expect404 }: Wanted): Promise<void> {
  const url = `${API_ORIGIN}${API_PREFIX}${path}`
  const file = recordingFileFor(url)
  if (file === null) throw new Error(`Can't make a recording file name for ${url}`)

  const response = await fetch(url)
  let recording: Recording
  if (expect404) {
    if (response.status !== 404) throw new Error(`${url}: expected 404, got ${response.status}`)
    recording = { status: 404, body: null }
  } else {
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    // parse, not safeParse: a response that doesn't match our schema should stop the recording
    recording = { status: 200, body: schema.parse(await response.json()) }
  }

  const target = join(RECORDINGS_DIR, file)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(recording, null, 2)}\n`)
  console.log(`${recording.status} ${path} → ${file}`)
}

for (const wanted of WANTED) {
  await record(wanted)
  await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
}
console.log(`Recorded ${WANTED.length} responses into ${RECORDINGS_DIR}`)
