// Records the PokéAPI answers the E2E tests need (M4 plan §5.2, D20). Run by hand, never in CI:
//   npm run e2e:record
// Each URL is fetched once from the live API, one at a time, checked with our own zod schemas
// (which also drops the fields Dexter doesn't use), and saved under e2e/fixtures/api/.
// Add a URL here when a new test needs one, then note it in e2e/fixtures/README.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { pokemonSchema, speciesIndexSchema } from '../src/api/schemas.ts'
import { API_ORIGIN, API_PREFIX, RECORDINGS_DIR, recordingFileFor, type Recording } from './recordings.ts'

interface Wanted {
  path: string // after /api/v2/, exactly as the app requests it
  schema: z.ZodType
  // A deliberate "not found" (none yet; later tests add them, e.g. a misspelt species)
  expect404?: boolean
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

const WANTED: Wanted[] = [
  // Journey 1, browse and paginate: the species index, then one Pokémon per card on pages 1 and 2
  { path: 'pokemon-species?limit=100000', schema: speciesIndexSchema },
  ...range(1, 40).map((id) => ({ path: `pokemon/${id}`, schema: pokemonSchema })),
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
