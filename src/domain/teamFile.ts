import type { z } from 'zod'
import {
  sameTeamName,
  speciesNameSchema,
  teamNameSchema,
  teamSchema,
  type Team,
  type TeamMember,
} from './team.ts'

// The team file (M3 plan §4.2): one team per file, for export (T9) and import (T10).
//   { "format": "dexter-team", "version": 1,
//     "team": { "name": "Rain team", "members": [ { "species": "pikachu", "nickname": "Sparky" } ] } }
// The team's id is left out: it only matters inside this browser, and an imported team gets a new one.
export const TEAM_FILE_FORMAT = 'dexter-team'
export const TEAM_FILE_VERSION = 1

export interface TeamFile {
  format: typeof TEAM_FILE_FORMAT
  version: typeof TEAM_FILE_VERSION
  team: { name: string; members: TeamMember[] }
}

export function toTeamFile(team: Team): TeamFile {
  return {
    format: TEAM_FILE_FORMAT,
    version: TEAM_FILE_VERSION,
    team: {
      name: team.name,
      // Copied field by field, so nothing else a member object might carry ends up in the file.
      // Array order is team order (D10), so it is kept as is.
      members: team.members.map(({ species, nickname }) => ({ species, nickname })),
    },
  }
}

// The file's text: JSON, indented with 2 spaces so people can read it
export function teamFileText(team: Team): string {
  return JSON.stringify(toTeamFile(team), null, 2)
}

// The file name, e.g. "Rain team" → "dexter-team-rain-team.json".
//
// Team names allow almost any character (D11), but a file name must not, so the name is turned
// into a "slug": lower case, and every run of characters that isn't a letter or number becomes
// one hyphen. That removes slashes, dots, < > : and the like, so "../x" can't point at another
// folder. Letters from any language are kept ("Équipe" → "équipe"). A name with no letters or
// numbers at all (e.g. "★★★") falls back to "untitled".
export function teamFileName(teamName: string): string {
  const slug = teamName
    .normalize('NFC')
    .toLowerCase()
    // \p{L} letters, \p{M} accents that combine with them, \p{N} numbers
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `dexter-team-${slug || 'untitled'}.json`
}

// ---------- Import (T10) ----------

// The largest file we read. A real team file is under 2 KB, so 16 KB leaves plenty of room while
// a huge file is turned away before the browser reads it into memory (§4.2 check 1).
export const MAX_TEAM_FILE_BYTES = 16 * 1024
export const FILE_TOO_BIG_MESSAGE = 'This file is too big to be a Dexter team file (the limit is 16 KB).'

// A hostile file can produce hundreds of problems; listing them all would bury the page
const MAX_MESSAGES = 10

export type ParsedTeamFile =
  | { ok: true; team: { name: string; members: TeamMember[] } }
  | { ok: false; messages: string[] }

// The team inside a file: the same rules as a stored team (D11 name, D12 nicknames, at most 6
// members, each species once), just without an id. zod keeps only these keys, so anything else
// in the file (including "__proto__" or "constructor") is dropped.
const fileTeamSchema = teamSchema.omit({ id: true })

// Reads the text of a team file and checks it in the order of plan §4.2 (the size, check 1, is
// done before reading, by the caller). The file is untrusted, so nothing in it is used until
// every check has passed. On failure every problem found is listed, as plain text.
//
// knownSpecies: every species name in PokéAPI's species index, so "pikachuu" (a typo) and
// "pikachu-gmax" (a form, not a species, D7) are rejected.
// existingTeams: the user's teams, so a clashing name is rejected (D11).
export function parseTeamFile(
  text: string,
  knownSpecies: ReadonlySet<string>,
  existingTeams: readonly Team[],
): ParsedTeamFile {
  // Check 2: valid JSON. JSON.parse never runs code; it only builds plain data.
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return failed(["This file isn't valid JSON, so it can't be a Dexter team file."])
  }

  // Check 3: the "envelope" says it is a Dexter team file of a version we know
  if (!isObject(data) || data.format !== TEAM_FILE_FORMAT) {
    return failed(["This isn't a Dexter team file: it doesn't say \"format\": \"dexter-team\"."])
  }
  if (data.version !== TEAM_FILE_VERSION) {
    const newer = typeof data.version === 'number' && data.version > TEAM_FILE_VERSION
    return failed([
      newer
        ? `This file was made by a newer version of Dexter (file version ${String(data.version)}). This version can only read version ${TEAM_FILE_VERSION}.`
        : "This team file's version isn't one Dexter knows.",
    ])
  }
  const team = data.team
  if (!isObject(team)) {
    return failed(['This file has no team in it.'])
  }

  // Checks 4–6 all run, so the user sees every problem at once
  const messages: string[] = []

  // Check 4: the same rules as the forms
  const parsed = fileTeamSchema.safeParse(team)
  if (!parsed.success) {
    // zod still runs the "at most 6" check on members that aren't a list ("pikachu" has 7
    // letters), so then only "Members must be a list." is kept
    const issues = parsed.error.issues.filter(
      (issue) => Array.isArray(team.members) || issue.path[0] !== 'members' || issue.code === 'invalid_type',
    )
    messages.push(...issues.map((issue) => describeIssue(issue, team)))
  }

  // Check 5: every species exists. Only names shaped like a species are looked up; a badly
  // shaped one already has a message from check 4.
  const members: unknown[] = Array.isArray(team.members) ? team.members : []
  members.forEach((member, index) => {
    const species = speciesNameSchema.safeParse(isObject(member) ? member.species : undefined)
    if (species.success && !knownSpecies.has(species.data)) {
      messages.push(`Pokémon ${index + 1}: "${species.data}" isn't a Pokémon species Dexter knows.`)
    }
  })

  // Check 6: the name doesn't clash with an existing team (" RAIN team " clashes with "Rain team")
  const name = teamNameSchema.safeParse(team.name)
  const clash = name.success ? existingTeams.find((existing) => sameTeamName(existing.name, name.data)) : undefined
  if (clash) {
    messages.push(`A team called '${clash.name}' already exists. Rename or delete that team, then import again.`)
  }

  if (!parsed.success || messages.length > 0) return failed(messages)
  return { ok: true, team: parsed.data }
}

function failed(messages: string[]): ParsedTeamFile {
  if (messages.length <= MAX_MESSAGES) return { ok: false, messages }
  const more = messages.length - MAX_MESSAGES
  return { ok: false, messages: [...messages.slice(0, MAX_MESSAGES), `…and ${more} more problem${more === 1 ? '' : 's'}.`] }
}

// A JSON object ({ ... }), not null, a list, a number or text
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// One zod problem as a sentence. Problems with one member say which, e.g.
// "Pokémon 2 (eevee): Nickname can only contain letters, numbers and spaces."
function describeIssue(issue: z.core.$ZodIssue, team: Record<string, unknown>): string {
  const [field, index] = issue.path
  if (field !== 'members' || typeof index !== 'number') return issue.message

  const member = Array.isArray(team.members) ? team.members[index] : undefined
  // The species is only repeated back if it is shaped like one (so at most 50 safe characters)
  const species = speciesNameSchema.safeParse(isObject(member) ? member.species : undefined)
  const which = `Pokémon ${index + 1}${species.success ? ` (${species.data})` : ''}`
  if (issue.path.length === 2) {
    // The member itself isn't an object, e.g. "pikachu" instead of { "species": "pikachu", ... }
    return `${which} must have a species and a nickname.`
  }
  return `${which}: ${issue.message}`
}
