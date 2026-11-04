import { z } from 'zod'
import { formatName } from './format.ts'

// Teams: the shape of a team and every rule about it, in one place (M3 plan T1).
// The forms, the storage loader and the import parser all use these same schemas and
// functions, so a rule can never be checked one way in a form and another way in a file.
// Pure code only: no React and no browser storage here.

export const MAX_TEAM_SIZE = 6
export const MAX_TEAM_NAME_LENGTH = 30
export const MAX_NICKNAME_LENGTH = 12
// Well above the longest real species name; only there so a hostile file can't send megabytes
export const MAX_SPECIES_NAME_LENGTH = 50

// Lengths are counted in code points ("characters" as a person sees them, mostly), not
// JavaScript's UTF-16 units, so a letter like 𝒜 counts as 1, not 2.
function codePointLength(text: string): number {
  return [...text].length
}

// The first message from a failed zod check, for showing next to a form field
function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Something is wrong with this value.'
}

// ---------- Team names (decision D11) ----------

// Control characters are invisible codes such as tab, line break and null (Unicode category Cc)
const CONTROL_CHARACTER = /\p{Cc}/u

// Trimmed, then 1–30 characters with no control characters. Anything else is allowed,
// including "<img>": React shows it as plain text, it never becomes markup.
export const teamNameSchema = z
  .string({ error: 'Team name must be text.' })
  .trim()
  .min(1, { error: 'Enter a team name.' })
  .refine((name) => codePointLength(name) <= MAX_TEAM_NAME_LENGTH, {
    error: `Team name must be ${MAX_TEAM_NAME_LENGTH} characters or fewer.`,
  })
  .refine((name) => !CONTROL_CHARACTER.test(name), {
    error: "Team name can't contain tabs, line breaks or other control characters.",
  })

// Two names clash if they only differ by surrounding spaces, capital letters, or the way an
// accent is encoded (NFC normalisation turns "e" + a separate accent mark into the single "é").
function teamNameKey(name: string): string {
  return name.trim().normalize('NFC').toLowerCase()
}

export function sameTeamName(a: string, b: string): boolean {
  return teamNameKey(a) === teamNameKey(b)
}

// ---------- Nicknames (decision D12) ----------

// Letters and numbers from any language (\p{L}, \p{N}) and the ordinary space only.
// No punctuation, symbols, emoji, tabs or non-breaking spaces.
const NICKNAME_PATTERN = /^[\p{L}\p{N} ]+$/u

// Only ordinary spaces are trimmed. (JavaScript's trim() would also remove tabs and
// non-breaking spaces, which would then sneak past the "spaces only" rule.)
function trimSpaces(text: string): string {
  return text.replace(/^ +| +$/g, '')
}

// Optional. Accepts the text from the form (or null) and gives back either a clean
// nickname or null, which means "no nickname". Empty or spaces-only input means no nickname.
export const nicknameSchema = z
  .union([z.string(), z.null()], { error: 'Nickname must be text.' })
  .transform((value) => {
    if (value === null) return null
    const nickname = trimSpaces(value.normalize('NFC'))
    return nickname === '' ? null : nickname
  })
  .pipe(
    z
      .string()
      .refine((nickname) => codePointLength(nickname) <= MAX_NICKNAME_LENGTH, {
        error: `Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer.`,
      })
      .refine((nickname) => NICKNAME_PATTERN.test(nickname), {
        error: 'Nickname can only contain letters, numbers and spaces.',
      })
      .nullable(),
  )

// ---------- Species, members and teams (decision D10) ----------

// Checks the name is *shaped* like a PokéAPI species name ("pikachu", "mr-mime", "porygon-z"):
// lowercase letters and digits, with single hyphens between them. Whether the species really
// exists is checked against the species index when importing (T10).
export const speciesNameSchema = z
  .string({ error: 'Species must be text.' })
  .max(MAX_SPECIES_NAME_LENGTH, { error: 'Species name is too long.' })
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    error: 'Species must be a Pokémon species name such as "pikachu" or "mr-mime".',
  })

// Only the species and nickname are stored. Types, stats and artwork always come from PokéAPI.
export const memberSchema = z.object({
  species: speciesNameSchema,
  nickname: nicknameSchema,
})

// The "each species once" rule sits on the members list rather than on the team object,
// because zod's .omit() refuses objects with extra rules attached, and the import step (T10)
// will want the team schema without its id.
const membersSchema = z
  .array(memberSchema, { error: 'Members must be a list.' })
  .max(MAX_TEAM_SIZE, { error: `A team can have at most ${MAX_TEAM_SIZE} Pokémon.` })
  .superRefine((members, ctx) => {
    for (const species of duplicates(members.map((member) => member.species))) {
      ctx.addIssue({
        code: 'custom',
        message: `${formatName(species)} is in the team more than once.`,
      })
    }
  })

// Team ids come from crypto.randomUUID(). Ids read back from the URL or storage must look like one.
export const teamIdSchema = z.uuid({ error: 'Team id is not valid.' })

// zod keeps only the keys listed here; any extra keys in stored or imported data are dropped
export const teamSchema = z.object({
  id: teamIdSchema,
  name: teamNameSchema,
  // Array order is team order
  members: membersSchema,
})

export type TeamMember = z.output<typeof memberSchema> // { species: string; nickname: string | null }
export type Team = z.output<typeof teamSchema> // { id: string; name: string; members: TeamMember[] }

// A whole list of teams, e.g. everything in browser storage: no two teams may share an id
// or a name (names compared with sameTeamName).
export const teamListSchema = z
  .array(teamSchema, { error: 'Teams must be a list.' })
  .superRefine((teams, ctx) => {
    for (const id of duplicates(teams.map((team) => team.id))) {
      ctx.addIssue({ code: 'custom', message: `More than one team has the id ${id}.` })
    }
    for (const key of duplicates(teams.map((team) => teamNameKey(team.name)))) {
      const name = teams.find((team) => teamNameKey(team.name) === key)?.name ?? key
      ctx.addIssue({ code: 'custom', message: `More than one team is called '${name}'.` })
    }
  })

// Values that appear more than once, each reported once
function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated]
}

export function newTeamId(): string {
  return crypto.randomUUID()
}

// ---------- Operations ----------
// Each one takes the current list of teams and returns either the new list, or a message
// explaining why the change isn't allowed. They never change the list they are given;
// on failure the caller keeps the old list, so nothing is half-changed.

export type TeamsResult = { ok: true; value: Team[] } | { ok: false; message: string }

const TEAM_NOT_FOUND = 'This team no longer exists.'

function fail(message: string): TeamsResult {
  return { ok: false, message }
}

// Swaps in a changed copy of one team, leaving every other team as it was
function replaceTeam(teams: Team[], updated: Team): Team[] {
  return teams.map((team) => (team.id === updated.id ? updated : team))
}

function nameTaken(teams: Team[], name: string, ignoreId?: string): Team | undefined {
  return teams.find((team) => team.id !== ignoreId && sameTeamName(team.name, name))
}

// A new, empty team at the end of the list. The id can be passed in (for tests); normally it's new.
export function createTeam(teams: Team[], name: string, id: string = newTeamId()): TeamsResult {
  const parsed = teamNameSchema.safeParse(name)
  if (!parsed.success) return fail(firstMessage(parsed.error))
  const clash = nameTaken(teams, parsed.data)
  if (clash) return fail(`A team called '${clash.name}' already exists.`)
  return { ok: true, value: [...teams, { id, name: parsed.data, members: [] }] }
}

// The team's own name doesn't count as a clash, so "rain team" can become "Rain Team"
export function renameTeam(teams: Team[], teamId: string, name: string): TeamsResult {
  const team = teams.find((t) => t.id === teamId)
  if (!team) return fail(TEAM_NOT_FOUND)
  const parsed = teamNameSchema.safeParse(name)
  if (!parsed.success) return fail(firstMessage(parsed.error))
  const clash = nameTaken(teams, parsed.data, teamId)
  if (clash) return fail(`A team called '${clash.name}' already exists.`)
  return { ok: true, value: replaceTeam(teams, { ...team, name: parsed.data }) }
}

export function deleteTeam(teams: Team[], teamId: string): TeamsResult {
  if (!teams.some((team) => team.id === teamId)) return fail(TEAM_NOT_FOUND)
  return { ok: true, value: teams.filter((team) => team.id !== teamId) }
}

// Adds a Pokémon at the end of the team, with no nickname
export function addMember(teams: Team[], teamId: string, species: string): TeamsResult {
  const team = teams.find((t) => t.id === teamId)
  if (!team) return fail(TEAM_NOT_FOUND)
  const parsed = speciesNameSchema.safeParse(species)
  if (!parsed.success) return fail(firstMessage(parsed.error))
  if (team.members.some((member) => member.species === species)) {
    return fail(`${formatName(species)} is already in '${team.name}'.`)
  }
  if (team.members.length >= MAX_TEAM_SIZE) {
    return fail(`'${team.name}' is full: a team can have at most ${MAX_TEAM_SIZE} Pokémon.`)
  }
  const members = [...team.members, { species, nickname: null }]
  return { ok: true, value: replaceTeam(teams, { ...team, members }) }
}

// Members are found by species (each species is in a team at most once), not by position,
// so a change made in another tab can't make this remove the wrong Pokémon.
export function removeMember(teams: Team[], teamId: string, species: string): TeamsResult {
  const team = teams.find((t) => t.id === teamId)
  if (!team) return fail(TEAM_NOT_FOUND)
  if (!team.members.some((member) => member.species === species)) {
    return fail(`${formatName(species)} isn't in '${team.name}'.`)
  }
  const members = team.members.filter((member) => member.species !== species)
  return { ok: true, value: replaceTeam(teams, { ...team, members }) }
}

// Swaps the member at `index` with its neighbour above or below. Moving the first member up,
// or the last one down, is allowed but changes nothing (the same list comes back).
export function moveMember(
  teams: Team[],
  teamId: string,
  index: number,
  direction: 'up' | 'down',
): TeamsResult {
  const team = teams.find((t) => t.id === teamId)
  if (!team) return fail(TEAM_NOT_FOUND)
  if (!Number.isInteger(index) || index < 0 || index >= team.members.length) {
    return fail('There is no Pokémon at that position in the team.')
  }
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= team.members.length) return { ok: true, value: teams }
  const members = [...team.members]
  ;[members[index], members[target]] = [members[target], members[index]]
  return { ok: true, value: replaceTeam(teams, { ...team, members }) }
}

// Sets or clears a nickname. The text goes through nicknameSchema, so "" or "   " clears it.
export function setNickname(
  teams: Team[],
  teamId: string,
  species: string,
  nickname: string | null,
): TeamsResult {
  const team = teams.find((t) => t.id === teamId)
  if (!team) return fail(TEAM_NOT_FOUND)
  if (!team.members.some((member) => member.species === species)) {
    return fail(`${formatName(species)} isn't in '${team.name}'.`)
  }
  const parsed = nicknameSchema.safeParse(nickname)
  if (!parsed.success) return fail(firstMessage(parsed.error))
  const members = team.members.map((member) =>
    member.species === species ? { ...member, nickname: parsed.data } : member,
  )
  return { ok: true, value: replaceTeam(teams, { ...team, members }) }
}

// Adds a team read from an imported file as a new team with a new id (M3 plan §4.2).
// The same rules as everywhere else: createTeam checks the name and that it doesn't clash,
// teamSchema checks the members. Existing teams are never replaced or changed.
export function addImportedTeam(
  teams: Team[],
  imported: { name: string; members: TeamMember[] },
  id: string = newTeamId(),
): TeamsResult {
  const created = createTeam(teams, imported.name, id)
  if (!created.ok) return created
  const parsed = teamSchema.safeParse({ id, name: imported.name, members: imported.members })
  if (!parsed.success) return fail(firstMessage(parsed.error))
  return { ok: true, value: [...teams, parsed.data] }
}
