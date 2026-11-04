import { describe, expect, it } from 'vitest'
import {
  addMember,
  createTeam,
  deleteTeam,
  MAX_TEAM_SIZE,
  moveMember,
  newTeamId,
  nicknameSchema,
  removeMember,
  renameTeam,
  sameTeamName,
  setNickname,
  speciesNameSchema,
  teamListSchema,
  teamNameSchema,
  teamSchema,
  type Team,
  type TeamsResult,
} from './team.ts'

const ID_A = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'
const ID_B = '0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d'
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const SIX = ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'eevee', 'snorlax']

function team(overrides: Partial<Team> = {}): Team {
  return { id: ID_A, name: 'Rain team', members: [], ...overrides }
}

function members(...species: string[]) {
  return species.map((name) => ({ species: name, nickname: null }))
}

// Narrows a result for the test, failing with the message if it wasn't ok
function value(result: TeamsResult): Team[] {
  if (!result.ok) throw new Error(`Expected ok, got: ${result.message}`)
  return result.value
}

function message(result: TeamsResult): string {
  if (result.ok) throw new Error('Expected a failure, got ok')
  return result.message
}

function nicknameErrors(input: string | null): string[] {
  const result = nicknameSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('nicknameSchema', () => {
  it('treats empty or spaces-only input as no nickname', () => {
    expect(nicknameSchema.parse('')).toBeNull()
    expect(nicknameSchema.parse('   ')).toBeNull()
    expect(nicknameSchema.parse(null)).toBeNull()
  })

  it('accepts 1 and 12 characters and rejects 13', () => {
    expect(nicknameSchema.parse('A')).toBe('A')
    expect(nicknameSchema.parse('Abcdefghijkl')).toBe('Abcdefghijkl')
    expect(nicknameErrors('Abcdefghijklm')).toEqual(['Nickname must be 12 characters or fewer.'])
  })

  it('accepts letters and numbers from any language, and spaces', () => {
    expect(nicknameSchema.parse('Rémi')).toBe('Rémi')
    expect(nicknameSchema.parse('ピカ')).toBe('ピカ')
    expect(nicknameSchema.parse('Ash 2')).toBe('Ash 2')
  })

  it.each([
    ['punctuation', 'Sparky!'],
    ['markup', '<b>'],
    ['emoji', 'Sparky ⚡'],
    ['a tab', 'Ash\t2'],
    ['a non-breaking space', 'Ash 2'],
    ['a tab at the end', 'Ash\t'],
    ['a non-breaking space at the start', ' Ash'],
  ])('rejects %s', (_label, input) => {
    expect(nicknameErrors(input)).toEqual(['Nickname can only contain letters, numbers and spaces.'])
  })

  it('normalises e + a separate accent mark into one letter', () => {
    const decomposed = 'Rémi' // 5 code points before normalising
    expect(nicknameSchema.parse(decomposed)).toBe('Rémi')
    expect(nicknameSchema.parse('é'.repeat(12))).toBe('é'.repeat(12))
  })

  it('counts a letter outside the BMP as 1 character', () => {
    // 𝒜 is one letter but two UTF-16 units, so .length would say 24
    expect(nicknameSchema.parse('𝒜'.repeat(12))).toBe('𝒜'.repeat(12))
    expect(nicknameErrors('𝒜'.repeat(13))).toEqual(['Nickname must be 12 characters or fewer.'])
  })

  it('trims spaces from the ends', () => {
    expect(nicknameSchema.parse('  Sparky  ')).toBe('Sparky')
    expect(nicknameSchema.parse(' Abcdefghijkl ')).toBe('Abcdefghijkl')
  })

  it('rejects values that are not text', () => {
    expect(nicknameErrors(42 as unknown as string)).toEqual(['Nickname must be text.'])
  })
})

describe('teamNameSchema', () => {
  function errors(input: unknown): string[] {
    const result = teamNameSchema.safeParse(input)
    return result.success ? [] : result.error.issues.map((issue) => issue.message)
  }

  it('rejects an empty or spaces-only name', () => {
    expect(errors('')).toEqual(['Enter a team name.'])
    expect(errors('    ')).toEqual(['Enter a team name.'])
  })

  it('accepts 30 characters and rejects 31', () => {
    expect(teamNameSchema.parse('a'.repeat(30))).toBe('a'.repeat(30))
    expect(errors('a'.repeat(31))).toEqual(['Team name must be 30 characters or fewer.'])
  })

  it('counts characters after trimming', () => {
    expect(teamNameSchema.parse(`  ${'a'.repeat(30)}  `)).toBe('a'.repeat(30))
  })

  it('rejects control characters', () => {
    const message = "Team name can't contain tabs, line breaks or other control characters."
    expect(errors('Rain\tteam')).toEqual([message])
    expect(errors('Rain\nteam')).toEqual([message])
    expect(errors('Rain\u0000team')).toEqual([message])
  })

  it('accepts markup-like text as plain text', () => {
    expect(teamNameSchema.parse('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
  })

  it('trims the ends', () => {
    expect(teamNameSchema.parse('  Rain team  ')).toBe('Rain team')
  })
})

describe('sameTeamName', () => {
  it('ignores capitals, surrounding spaces and accent encoding', () => {
    expect(sameTeamName('Rain Team', 'rain team')).toBe(true)
    expect(sameTeamName('Rain Team', ' Rain Team ')).toBe(true)
    expect(sameTeamName('Café', 'Café')).toBe(true)
  })

  it('tells different names apart', () => {
    expect(sameTeamName('Rain team', 'Rain team 2')).toBe(false)
    expect(sameTeamName('Rain team', 'Raint eam')).toBe(false)
  })
})

describe('speciesNameSchema', () => {
  it.each(['pikachu', 'mr-mime', 'porygon-z', 'nidoran-f', 'porygon2'])('accepts %s', (name) => {
    expect(speciesNameSchema.parse(name)).toBe(name)
  })

  it.each(['', 'Pikachu', 'mr mime', '-pikachu', 'pikachu-', 'mr--mime', '<b>', 'a'.repeat(51)])(
    'rejects %j',
    (name) => {
      expect(speciesNameSchema.safeParse(name).success).toBe(false)
    },
  )
})

describe('createTeam', () => {
  it('adds an empty team with a trimmed name at the end', () => {
    const teams = value(createTeam([team()], '  Sun team ', ID_B))
    expect(teams).toEqual([team(), { id: ID_B, name: 'Sun team', members: [] }])
  })

  it('gives the team a new id when none is passed', () => {
    const [created] = value(createTeam([], 'Rain team'))
    expect(created.id).toMatch(UUID_SHAPE)
  })

  it.each(['Rain team', 'rain team', 'RAIN TEAM', ' Rain team '])(
    'rejects %j when "Rain team" exists',
    (name) => {
      expect(message(createTeam([team()], name))).toBe("A team called 'Rain team' already exists.")
    },
  )

  it('rejects a name that clashes once accents are normalised', () => {
    const existing = [team({ name: 'Café' })]
    expect(message(createTeam(existing, 'café'))).toBe("A team called 'Café' already exists.")
  })

  it('rejects an invalid name with the schema message', () => {
    expect(message(createTeam([], '   '))).toBe('Enter a team name.')
  })

  it('does not change the list it was given', () => {
    const teams = [team()]
    createTeam(teams, 'Sun team', ID_B)
    expect(teams).toEqual([team()])
  })
})

describe('renameTeam', () => {
  const teams = [team({ name: 'rain team' }), team({ id: ID_B, name: 'Sun team' })]

  it('renames the team', () => {
    expect(value(renameTeam(teams, ID_B, ' Sand team '))[1].name).toBe('Sand team')
  })

  it('allows a team to change the capitals of its own name', () => {
    expect(value(renameTeam(teams, ID_A, 'Rain Team'))[0].name).toBe('Rain Team')
  })

  it("rejects another team's name, in any capitals", () => {
    expect(message(renameTeam(teams, ID_B, 'RAIN TEAM'))).toBe("A team called 'rain team' already exists.")
  })

  it('rejects an invalid name', () => {
    expect(message(renameTeam(teams, ID_A, 'a'.repeat(31)))).toBe(
      'Team name must be 30 characters or fewer.',
    )
  })

  it('reports a team that no longer exists', () => {
    expect(message(renameTeam(teams, newTeamId(), 'Hail team'))).toBe('This team no longer exists.')
  })
})

describe('deleteTeam', () => {
  it('removes only that team', () => {
    const teams = [team(), team({ id: ID_B, name: 'Sun team' })]
    expect(value(deleteTeam(teams, ID_A))).toEqual([team({ id: ID_B, name: 'Sun team' })])
  })

  it('reports a team that no longer exists', () => {
    expect(message(deleteTeam([team()], ID_B))).toBe('This team no longer exists.')
  })
})

describe('addMember', () => {
  it('adds the Pokémon at the end with no nickname', () => {
    const teams = value(addMember([team({ members: members('pikachu') })], ID_A, 'eevee'))
    expect(teams[0].members).toEqual(members('pikachu', 'eevee'))
  })

  it(`accepts the ${MAX_TEAM_SIZE}th member and rejects a 7th, leaving the team unchanged`, () => {
    const five = [team({ members: members(...SIX.slice(0, 5)) })]
    const full = value(addMember(five, ID_A, SIX[5]))
    expect(full[0].members).toEqual(members(...SIX))

    const result = addMember(full, ID_A, 'mewtwo')
    expect(message(result)).toBe("'Rain team' is full: a team can have at most 6 Pokémon.")
    expect(full[0].members).toEqual(members(...SIX))
  })

  it('rejects the same species twice', () => {
    const teams = [team({ members: members('mr-mime') })]
    expect(message(addMember(teams, ID_A, 'mr-mime'))).toBe("mr mime is already in 'Rain team'.")
  })

  it('rejects a badly formed species name', () => {
    expect(addMember([team()], ID_A, '<script>').ok).toBe(false)
  })

  it('only changes the chosen team', () => {
    const other = team({ id: ID_B, name: 'Sun team' })
    const teams = value(addMember([team(), other], ID_A, 'pikachu'))
    expect(teams[1]).toBe(other)
  })

  it('reports a team that no longer exists', () => {
    expect(message(addMember([], ID_A, 'pikachu'))).toBe('This team no longer exists.')
  })
})

describe('removeMember', () => {
  it('removes the Pokémon and keeps the order of the rest', () => {
    const teams = [team({ members: members('pikachu', 'eevee', 'snorlax') })]
    expect(value(removeMember(teams, ID_A, 'eevee'))[0].members).toEqual(members('pikachu', 'snorlax'))
  })

  it('reports a Pokémon that is not in the team', () => {
    expect(message(removeMember([team()], ID_A, 'pikachu'))).toBe("pikachu isn't in 'Rain team'.")
  })
})

describe('moveMember', () => {
  const teams = [team({ members: members('pikachu', 'eevee', 'snorlax') })]

  it('swaps a middle member with its neighbour', () => {
    expect(value(moveMember(teams, ID_A, 1, 'up'))[0].members).toEqual(
      members('eevee', 'pikachu', 'snorlax'),
    )
    expect(value(moveMember(teams, ID_A, 1, 'down'))[0].members).toEqual(
      members('pikachu', 'snorlax', 'eevee'),
    )
  })

  it('leaves the team unchanged at the top and bottom', () => {
    expect(value(moveMember(teams, ID_A, 0, 'up'))).toBe(teams)
    expect(value(moveMember(teams, ID_A, 2, 'down'))).toBe(teams)
  })

  it.each([-1, 3, 1.5])('rejects position %d', (index) => {
    expect(message(moveMember(teams, ID_A, index, 'up'))).toBe(
      'There is no Pokémon at that position in the team.',
    )
  })
})

describe('setNickname', () => {
  const teams = [team({ members: members('pikachu', 'eevee') })]

  it('sets a cleaned-up nickname on that member only', () => {
    const updated = value(setNickname(teams, ID_A, 'pikachu', '  Sparky '))
    expect(updated[0].members).toEqual([
      { species: 'pikachu', nickname: 'Sparky' },
      { species: 'eevee', nickname: null },
    ])
  })

  it('clears the nickname with empty input', () => {
    const named = value(setNickname(teams, ID_A, 'pikachu', 'Sparky'))
    expect(value(setNickname(named, ID_A, 'pikachu', ''))[0].members[0].nickname).toBeNull()
  })

  it('rejects an invalid nickname with the schema message', () => {
    expect(message(setNickname(teams, ID_A, 'pikachu', 'Sparky!'))).toBe(
      'Nickname can only contain letters, numbers and spaces.',
    )
  })

  it('reports a Pokémon that is not in the team', () => {
    expect(message(setNickname(teams, ID_A, 'snorlax', 'Snoozy'))).toBe(
      "snorlax isn't in 'Rain team'.",
    )
  })
})

describe('teamSchema', () => {
  it('accepts a valid team', () => {
    const valid = team({ members: [{ species: 'pikachu', nickname: 'Sparky' }] })
    expect(teamSchema.parse(valid)).toEqual(valid)
  })

  it('rejects 7 members', () => {
    expect(teamSchema.safeParse(team({ members: members(...SIX, 'mewtwo') })).success).toBe(false)
  })

  it('rejects the same species twice', () => {
    const result = teamSchema.safeParse(team({ members: members('pikachu', 'pikachu') }))
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'pikachu is in the team more than once.',
    ])
  })

  it('rejects an id that is not a UUID', () => {
    expect(teamSchema.safeParse(team({ id: '../etc' })).success).toBe(false)
  })

  it('applies the name and nickname rules, cleaning up what it accepts', () => {
    const parsed = teamSchema.parse({
      id: ID_A,
      name: '  Rain team ',
      members: [{ species: 'pikachu', nickname: '   ' }],
    })
    expect(parsed).toEqual(team({ members: members('pikachu') }))
    expect(
      teamSchema.safeParse(team({ members: [{ species: 'pikachu', nickname: '<b>' }] })).success,
    ).toBe(false)
  })

  it('drops unknown keys', () => {
    const parsed = teamSchema.parse({
      ...team({ members: [{ species: 'pikachu', nickname: null, level: 99 } as never] }),
      extra: true,
    })
    expect(parsed).toEqual(team({ members: members('pikachu') }))
  })
})

describe('teamListSchema', () => {
  it('accepts teams with different ids and names', () => {
    const teams = [team(), team({ id: ID_B, name: 'Sun team' })]
    expect(teamListSchema.parse(teams)).toEqual(teams)
  })

  it('rejects two teams with the same id', () => {
    const result = teamListSchema.safeParse([team(), team({ name: 'Sun team' })])
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      `More than one team has the id ${ID_A}.`,
    ])
  })

  it('rejects two teams whose names clash', () => {
    const result = teamListSchema.safeParse([team(), team({ id: ID_B, name: 'RAIN TEAM' })])
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "More than one team is called 'Rain team'.",
    ])
  })

  it('rejects a list containing an invalid team', () => {
    expect(teamListSchema.safeParse([team({ members: members(...SIX, 'mewtwo') })]).success).toBe(false)
  })
})

describe('newTeamId', () => {
  it('returns a different UUID each time', () => {
    const ids = Array.from({ length: 50 }, newTeamId)
    for (const id of ids) expect(id).toMatch(UUID_SHAPE)
    expect(new Set(ids).size).toBe(50)
  })
})
