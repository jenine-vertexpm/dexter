import { describe, expect, it } from 'vitest'
import { createTeam, type Team } from '../domain/team.ts'
import { initialTeamsState, teamsReducer } from './teamsReducer.ts'

// Most behaviour is tested through TeamsProvider. These cover cases that are hard to time there.

const ID_A = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'
const RAIN: Team = { id: ID_A, name: 'Rain team', members: [] }

describe('teamsReducer', () => {
  it('does not mark a newer change as saved when an older save finishes', () => {
    const start = initialTeamsState({ status: 'ok', teams: [RAIN] })
    const changed = teamsReducer(start, {
      type: 'change',
      apply: (teams) => createTeam(teams, 'Sun team'),
    })
    expect(changed.saveRequested).toBe(true)
    const afterOldSave = teamsReducer(changed, {
      type: 'saved',
      teams: start.teams,
      result: { ok: true },
    })
    expect(afterOldSave).toBe(changed)
  })

  it('maps each load result to the teams and storage status', () => {
    expect(initialTeamsState({ status: 'empty' })).toMatchObject({ teams: [], storage: { status: 'ok' } })
    expect(initialTeamsState({ status: 'unavailable' })).toMatchObject({
      teams: [],
      storage: { status: 'unavailable' },
    })
    expect(
      initialTeamsState({ status: 'salvaged', teams: [RAIN], dropped: 2, original: 'x' }),
    ).toMatchObject({ teams: [RAIN], storage: { status: 'salvaged', dropped: 2, original: 'x' } })
  })

  it('a load from another tab cancels a pending save, so it cannot overwrite that tab', () => {
    const changed = teamsReducer(initialTeamsState({ status: 'empty' }), {
      type: 'change',
      apply: (teams) => createTeam(teams, 'Sun team'),
    })
    const loaded = teamsReducer(changed, { type: 'loaded', result: { status: 'unreadable', original: 'x' } })
    expect(loaded.saveRequested).toBe(false)
  })
})
