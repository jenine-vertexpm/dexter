import type { Team, TeamMember } from './team.ts'

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
