import { describe, expect, it } from 'vitest'
import type { Team } from './team.ts'
import speciesIndex from '../test/fixtures/species-index.json'
import { parseTeamFile, teamFileName, teamFileText, toTeamFile } from './teamFile.ts'

const RAIN: Team = {
  id: '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60',
  name: 'Rain team',
  members: [
    { species: 'pikachu', nickname: 'Sparky' },
    { species: 'eevee', nickname: null },
    { species: 'deoxys', nickname: 'Space Rock' },
  ],
}

describe('toTeamFile', () => {
  it('has the §4.2 shape: format, version, and the team’s name and members', () => {
    expect(toTeamFile(RAIN)).toEqual({
      format: 'dexter-team',
      version: 1,
      team: {
        name: 'Rain team',
        members: [
          { species: 'pikachu', nickname: 'Sparky' },
          { species: 'eevee', nickname: null },
          { species: 'deoxys', nickname: 'Space Rock' },
        ],
      },
    })
  })

  it('leaves out the team id', () => {
    const text = teamFileText(RAIN)

    expect(toTeamFile(RAIN).team).not.toHaveProperty('id')
    expect(text).not.toContain(RAIN.id)
  })

  it('keeps an empty team as an empty member list', () => {
    expect(toTeamFile({ ...RAIN, members: [] }).team.members).toEqual([])
  })
})

describe('teamFileText', () => {
  it('is JSON indented with 2 spaces that reads back to the same file', () => {
    const text = teamFileText(RAIN)

    expect(JSON.parse(text)).toEqual(toTeamFile(RAIN))
    expect(text.split('\n')[1]).toBe('  "format": "dexter-team",')
  })
})

describe('teamFileName', () => {
  it('turns the name into a lower-case slug: "Rain team" → dexter-team-rain-team.json', () => {
    expect(teamFileName('Rain team')).toBe('dexter-team-rain-team.json')
  })

  it.each([
    ['../x', 'dexter-team-x.json'],
    ['..\\..\\Windows\\x', 'dexter-team-windows-x.json'],
    ['<b>Bold</b>', 'dexter-team-b-bold-b.json'],
    ['a/b:c*d?e"f|g', 'dexter-team-a-b-c-d-e-f-g.json'],
    ['★★★', 'dexter-team-untitled.json'],
    ['!!! ???', 'dexter-team-untitled.json'],
    ['  Many   spaces  ', 'dexter-team-many-spaces.json'],
  ])('makes a hostile or odd name safe: %s → %s', (name, expected) => {
    expect(teamFileName(name)).toBe(expected)
  })

  it('keeps letters and numbers from any language', () => {
    expect(teamFileName('Équipe Pluie 2')).toBe('dexter-team-équipe-pluie-2.json')
  })

  it('never contains a path separator, dot-dot or markup, whatever the name', () => {
    for (const name of ['../../etc/passwd', '<script>x</script>', 'C:\\x', '.hidden', 'con.json']) {
      const slug = teamFileName(name).slice('dexter-team-'.length, -'.json'.length)
      expect(slug).toMatch(/^[\p{L}\p{M}\p{N}]+(-[\p{L}\p{M}\p{N}]+)*$/u)
    }
  })
})

describe('parseTeamFile', () => {
  // The 46 species in the test species index (pikachu, eevee, deoxys, ...)
  const KNOWN = new Set(speciesIndex.results.map((result) => result.name))
  const NO_TEAMS: Team[] = []
  const NOT_JSON = "This file isn't valid JSON, so it can't be a Dexter team file."
  const NOT_A_TEAM_FILE = 'This isn\'t a Dexter team file: it doesn\'t say "format": "dexter-team".'

  // A file's text with this team inside a valid envelope
  function fileWith(team: unknown): string {
    return JSON.stringify({ format: 'dexter-team', version: 1, team })
  }

  function messages(text: string, existing: Team[] = NO_TEAMS): string[] {
    const result = parseTeamFile(text, KNOWN, existing)
    if (result.ok) throw new Error('Expected the file to be rejected')
    return result.messages
  }

  describe('a valid file', () => {
    it('gives back the name and the members, in order, with nicknames', () => {
      expect(parseTeamFile(teamFileText(RAIN), KNOWN, NO_TEAMS)).toEqual({
        ok: true,
        team: { name: RAIN.name, members: RAIN.members },
      })
    })

    it('tidies values the way the forms do: name and nicknames trimmed', () => {
      const text = fileWith({ name: '  Rain team  ', members: [{ species: 'pikachu', nickname: ' Sparky ' }] })

      expect(parseTeamFile(text, KNOWN, NO_TEAMS)).toEqual({
        ok: true,
        team: { name: 'Rain team', members: [{ species: 'pikachu', nickname: 'Sparky' }] },
      })
    })

    it('accepts a name with markup in it: it is only text (D11)', () => {
      const name = '<img src=x onerror=alert(1)>'

      expect(parseTeamFile(fileWith({ name, members: [] }), KNOWN, NO_TEAMS)).toEqual({
        ok: true,
        team: { name, members: [] },
      })
    })
  })

  describe('rejected before the team is looked at', () => {
    it.each([
      ['not JSON', '{ "format": "dexter-team", ', NOT_JSON],
      ['empty', '', NOT_JSON],
      ['null', 'null', NOT_A_TEAM_FILE],
      ['a list', '[]', NOT_A_TEAM_FILE],
      ['a number', '42', NOT_A_TEAM_FILE],
      ['text', '"dexter-team"', NOT_A_TEAM_FILE],
      ['an unknown format', JSON.stringify({ format: 'pokemon-showdown', version: 1, team: {} }), NOT_A_TEAM_FILE],
      ['no format', JSON.stringify({ version: 1, team: {} }), NOT_A_TEAM_FILE],
    ])('%s', (_, text, expected) => {
      expect(messages(text)).toEqual([expected])
    })

    it('version 2 → made by a newer version', () => {
      const text = JSON.stringify({ format: 'dexter-team', version: 2, team: { name: 'Rain team', members: [] } })

      expect(messages(text)).toEqual([
        'This file was made by a newer version of Dexter (file version 2). This version can only read version 1.',
      ])
    })

    it.each([['"1"'], ['0'], ['null']])('version %s → not a version Dexter knows', (version) => {
      const text = `{ "format": "dexter-team", "version": ${version}, "team": { "name": "Rain team", "members": [] } }`

      expect(messages(text)).toEqual(["This team file's version isn't one Dexter knows."])
    })

    it.each([
      ['missing', { format: 'dexter-team', version: 1 }],
      ['a list', { format: 'dexter-team', version: 1, team: [] }],
      ['text', { format: 'dexter-team', version: 1, team: 'Rain team' }],
    ])('team %s → no team in the file', (_, file) => {
      expect(messages(JSON.stringify(file))).toEqual(['This file has no team in it.'])
    })
  })

  describe('rule failures: the same rules as the forms', () => {
    it('7 members', () => {
      const species = ['bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard', 'squirtle']
      const text = fileWith({ name: 'Big team', members: species.map((name) => ({ species: name, nickname: null })) })

      expect(messages(text)).toEqual(['A team can have at most 6 Pokémon.'])
    })

    it('the same species twice', () => {
      const text = fileWith({
        name: 'Twins',
        members: [
          { species: 'pikachu', nickname: null },
          { species: 'pikachu', nickname: 'Again' },
        ],
      })

      expect(messages(text)).toEqual(['pikachu is in the team more than once.'])
    })

    it.each([
      ['13 characters', 'Thirteen char', 'Nickname must be 12 characters or fewer.'],
      ['punctuation', 'Sparky!', 'Nickname can only contain letters, numbers and spaces.'],
      ['markup', '<script>', 'Nickname can only contain letters, numbers and spaces.'],
    ])('a nickname with %s, naming the member', (_, nickname, message) => {
      const text = fileWith({
        name: 'Rain team',
        members: [
          { species: 'eevee', nickname: null },
          { species: 'pikachu', nickname },
        ],
      })

      expect(messages(text)).toEqual([`Pokémon 2 (pikachu): ${message}`])
    })

    it.each([
      ['31 characters', 'A'.repeat(31), 'Team name must be 30 characters or fewer.'],
      ['a control character', 'Rain\u0007team', "Team name can't contain tabs, line breaks or other control characters."],
      ['a line break', 'Rain\nteam', "Team name can't contain tabs, line breaks or other control characters."],
      ['only spaces', '   ', 'Enter a team name.'],
      ['not text', 42, 'Team name must be text.'],
    ])('a team name with %s', (_, name, message) => {
      expect(messages(fileWith({ name, members: [] }))).toEqual([message])
    })

    it('a member that is not an object, or has a badly shaped species', () => {
      const text = fileWith({ name: 'Rain team', members: ['pikachu', { species: 'Pikachu!', nickname: null }] })

      expect(messages(text)).toEqual([
        'Pokémon 1 must have a species and a nickname.',
        'Pokémon 2: Species must be a Pokémon species name such as "pikachu" or "mr-mime".',
      ])
    })

    it('members that are not a list', () => {
      expect(messages(fileWith({ name: 'Rain team', members: 'pikachu' }))).toEqual(['Members must be a list.'])
    })
  })

  describe('species check (species index)', () => {
    it.each([['pikachuu'], ['pikachu-gmax']])('rejects %s, which is not a species', (species) => {
      const text = fileWith({ name: 'Rain team', members: [{ species, nickname: null }] })

      expect(messages(text)).toEqual([`Pokémon 1: "${species}" isn't a Pokémon species Dexter knows.`])
    })
  })

  describe('name clash (D11)', () => {
    it('rejects " RAIN team " when "Rain team" exists, with the §4.2 message', () => {
      const text = fileWith({ name: ' RAIN team ', members: [] })

      expect(messages(text, [RAIN])).toEqual([
        "A team called 'Rain team' already exists. Rename or delete that team, then import again.",
      ])
    })
  })

  describe('several problems', () => {
    it('lists every problem at once', () => {
      const text = fileWith({
        name: 'Rain team',
        members: [
          { species: 'pikachuu', nickname: null },
          { species: 'eevee', nickname: 'Fluffy!' },
        ],
      })

      expect(messages(text, [RAIN])).toEqual([
        'Pokémon 2 (eevee): Nickname can only contain letters, numbers and spaces.',
        'Pokémon 1: "pikachuu" isn\'t a Pokémon species Dexter knows.',
        "A team called 'Rain team' already exists. Rename or delete that team, then import again.",
      ])
    })

    it('shows at most 10, then says how many more there are', () => {
      // 40 unknown species: one "too many" problem plus 40 species problems
      const members = Array.from({ length: 40 }, (_, i) => ({ species: `fake${i}`, nickname: null }))
      const result = messages(fileWith({ name: 'Huge', members }))

      expect(result).toHaveLength(11)
      expect(result[10]).toBe('…and 31 more problems.')
    })
  })

  describe('prototype pollution', () => {
    it('ignores __proto__ and constructor keys, and leaves Object.prototype unchanged', () => {
      // Written as text: an object literal with __proto__ would set the prototype in the test itself
      const text = `{
        "__proto__": { "polluted": "top" },
        "constructor": { "prototype": { "polluted": "constructor" } },
        "format": "dexter-team",
        "version": 1,
        "team": {
          "__proto__": { "polluted": "team", "isAdmin": true },
          "name": "Rain team",
          "members": [
            { "species": "pikachu", "nickname": null, "__proto__": { "polluted": "member" } }
          ]
        }
      }`

      const result = parseTeamFile(text, KNOWN, NO_TEAMS)

      expect(result).toEqual({ ok: true, team: { name: 'Rain team', members: [{ species: 'pikachu', nickname: null }] } })
      // Only the expected keys survive, and nothing reached the prototype every object shares
      if (!result.ok) throw new Error('Expected the file to be accepted')
      expect(Object.keys(result.team)).toEqual(['name', 'members'])
      expect(Object.keys(result.team.members[0])).toEqual(['species', 'nickname'])
      expect(Object.prototype).not.toHaveProperty('polluted')
      expect(Object.prototype).not.toHaveProperty('isAdmin')
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })
  })
})
