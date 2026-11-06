import { describe, expect, it } from 'vitest'
import type { Team } from './team.ts'
import { teamFileName, teamFileText, toTeamFile } from './teamFile.ts'

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
