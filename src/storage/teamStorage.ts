import { z } from 'zod'
import { teamListSchema, type Team } from '../domain/team.ts'

// Saving and loading teams in the browser (M3 plan T2, decisions D9 and D14). No React here.
//
// What is stored, under one key:  { "version": 1, "teams": [ ...teams ] }
// The version number lets a future release recognise and upgrade (migrate) older data.
//
// Browser storage is untrusted (brief §3.5): the user, an extension or an older build can put
// anything there. So everything read back is checked with the same rules as the forms (T1).
// Loading never writes: data that couldn't be fully read stays exactly as it was until the user
// chooses what to do with it (T5), so nothing is ever silently lost.

export const TEAMS_STORAGE_KEY = 'dexter.teams'
export const STORAGE_VERSION = 1

// Only the two methods we use, so tests can pass in a small fake (for example one that throws)
export type TeamStorage = Pick<Storage, 'getItem' | 'setItem'>

// Upgrades stored data from one version to the next: MIGRATIONS[1] would turn version 1 data
// into version 2 data. Empty for now, because version 1 is the first version.
export type Migration = (data: unknown) => unknown
export type Migrations = Readonly<Record<number, Migration>>
const MIGRATIONS: Migrations = {}

export type LoadResult =
  // Nothing saved yet
  | { status: 'empty' }
  // Everything was read and is valid
  | { status: 'ok'; teams: Team[] }
  // Some teams were invalid and left out. `original` is the stored text, kept for a download.
  | { status: 'salvaged'; teams: Team[]; dropped: number; original: string }
  // Not valid JSON, the wrong shape, or an old version we can't upgrade
  | { status: 'unreadable'; original: string }
  // Saved by a newer version of Dexter than this one, so we don't try to read it
  | { status: 'newer-version'; original: string }
  // The browser blocks storage (e.g. private mode or blocked cookies)
  | { status: 'unavailable' }

export type SaveResult = { ok: true } | { ok: false; error: 'quota' | 'unavailable' }

// In some browsers, merely reading `window.localStorage` throws when storage is blocked.
// Returns null in that case, which loadTeams and saveTeams treat as 'unavailable'.
export function getBrowserStorage(): TeamStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// The two outer checks, before any team is looked at
const versionSchema = z.object({ version: z.number().int() })
const teamsArraySchema = z.object({ teams: z.array(z.unknown()) })

// Never throws, never writes. `options` lets tests pretend the app is at a later version.
export function loadTeams(
  storage: TeamStorage | null,
  options: { version?: number; migrations?: Migrations } = {},
): LoadResult {
  const { version: currentVersion = STORAGE_VERSION, migrations = MIGRATIONS } = options
  if (storage === null) return { status: 'unavailable' }

  let original: string | null
  try {
    original = storage.getItem(TEAMS_STORAGE_KEY)
  } catch {
    return { status: 'unavailable' }
  }
  if (original === null) return { status: 'empty' }

  let data: unknown
  try {
    data = JSON.parse(original)
  } catch {
    return { status: 'unreadable', original }
  }

  const versioned = versionSchema.safeParse(data)
  if (!versioned.success) return { status: 'unreadable', original }
  const storedVersion = versioned.data.version
  if (storedVersion > currentVersion) return { status: 'newer-version', original }

  const migrated = runMigrations(data, storedVersion, currentVersion, migrations)
  if (!migrated.ok) return { status: 'unreadable', original }

  const envelope = teamsArraySchema.safeParse(migrated.data)
  if (!envelope.success) return { status: 'unreadable', original }

  // Keep each team that passes the T1 rules *together with the teams already kept*, so an
  // invalid team, or a repeated id or name, is dropped and the first one wins.
  let teams: Team[] = []
  for (const candidate of envelope.data.teams) {
    const checked = teamListSchema.safeParse([...teams, candidate])
    if (checked.success) teams = checked.data
  }

  const dropped = envelope.data.teams.length - teams.length
  if (dropped > 0) return { status: 'salvaged', teams, dropped, original }
  return { status: 'ok', teams }
}

// Applies each upgrade in turn, from `fromVersion` up to `toVersion`. If any step is missing
// (a gap), or an upgrade fails, the data is refused rather than half-upgraded.
export function runMigrations(
  data: unknown,
  fromVersion: number,
  toVersion: number,
  migrations: Migrations,
): { ok: true; data: unknown } | { ok: false } {
  let current = data
  for (let version = fromVersion; version < toVersion; version++) {
    const upgrade = migrations[version]
    if (!upgrade) return { ok: false }
    try {
      current = upgrade(current)
    } catch {
      return { ok: false }
    }
  }
  return { ok: true, data: current }
}

// Never throws. The teams are expected to be valid already (they come from the T1 operations).
export function saveTeams(storage: TeamStorage | null, teams: Team[]): SaveResult {
  if (storage === null) return { ok: false, error: 'unavailable' }
  try {
    storage.setItem(TEAMS_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, teams }))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: isQuotaError(error) ? 'quota' : 'unavailable' }
  }
}

// Browsers report "storage is full" as a QuotaExceededError
// (older Firefox versions used the name NS_ERROR_DOM_QUOTA_REACHED)
function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}
