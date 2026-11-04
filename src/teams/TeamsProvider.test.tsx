import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Team } from '../domain/team.ts'
import { TEAMS_STORAGE_KEY, type TeamStorage } from '../storage/teamStorage.ts'
import { seedStoredTeams } from '../test/render.tsx'
import { SAVING_PAUSED_MESSAGE } from './teamsReducer.ts'
import { TeamsProvider } from './TeamsProvider.tsx'
import { useTeams } from './useTeams.ts'

const ID_A = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'
const ID_B = '0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d'
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const RAIN: Team = {
  id: ID_A,
  name: 'Rain team',
  members: [
    { species: 'pikachu', nickname: 'Sparky' },
    { species: 'eevee', nickname: null },
  ],
}
const SUN: Team = { id: ID_B, name: 'Sun team', members: [] }

// Renders useTeams inside a TeamsProvider. With no `storage`, the provider uses localStorage.
function renderTeams(storage?: TeamStorage | null) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    storage === undefined ? (
      <TeamsProvider>{children}</TeamsProvider>
    ) : (
      <TeamsProvider storage={storage}>{children}</TeamsProvider>
    )
  return renderHook(() => useTeams(), { wrapper })
}

function stored() {
  return localStorage.getItem(TEAMS_STORAGE_KEY)
}

function storedTeams(): Team[] {
  return JSON.parse(stored() ?? 'null').teams
}

// What another tab would cause: it saves, and this tab's window gets a storage event
function saveFromAnotherTab(text: string) {
  act(() => {
    localStorage.setItem(TEAMS_STORAGE_KEY, text)
    window.dispatchEvent(new StorageEvent('storage', { key: TEAMS_STORAGE_KEY, newValue: text }))
  })
}

describe('TeamsProvider: loading', () => {
  it('starts with no teams when nothing is saved, without writing anything', () => {
    const { result } = renderTeams()
    expect(result.current.teams).toEqual([])
    expect(result.current.storage).toEqual({ status: 'ok' })
    expect(stored()).toBeNull()
  })

  it('starts from the teams in storage', () => {
    seedStoredTeams([RAIN, SUN])
    const { result } = renderTeams()
    expect(result.current.teams).toEqual([RAIN, SUN])
    expect(result.current.savingPaused).toBe(false)
  })

  it('throws a clear error when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // React logs the error too
    expect(() => renderHook(() => useTeams())).toThrow('useTeams must be used inside <TeamsProvider>')
    vi.restoreAllMocks()
  })
})

describe('TeamsProvider: changes persist', () => {
  it('saves a new team', () => {
    const { result } = renderTeams()
    let outcome
    act(() => {
      outcome = result.current.createTeam('  Rain team ')
    })
    expect(outcome).toMatchObject({ ok: true })
    const [created] = result.current.teams
    expect(created).toEqual({ id: expect.stringMatching(UUID_SHAPE), name: 'Rain team', members: [] })
    expect(storedTeams()).toEqual([created])
  })

  it('saves added members and moves', () => {
    seedStoredTeams([RAIN])
    const { result } = renderTeams()
    act(() => {
      result.current.addMember(ID_A, 'snorlax')
    })
    act(() => {
      result.current.moveMember(ID_A, 2, 'up')
    })
    const species = ['pikachu', 'snorlax', 'eevee']
    expect(result.current.teams[0].members.map((m) => m.species)).toEqual(species)
    expect(storedTeams()[0].members.map((m) => m.species)).toEqual(species)
  })

  it('saves renames, nicknames, removals and deletions', () => {
    seedStoredTeams([RAIN, SUN])
    const { result } = renderTeams()
    act(() => {
      result.current.renameTeam(ID_A, 'Storm team')
    })
    act(() => {
      result.current.setNickname(ID_A, 'eevee', ' Evie ')
    })
    act(() => {
      result.current.removeMember(ID_A, 'pikachu')
    })
    act(() => {
      result.current.deleteTeam(ID_B)
    })
    const expected = [{ id: ID_A, name: 'Storm team', members: [{ species: 'eevee', nickname: 'Evie' }] }]
    expect(result.current.teams).toEqual(expected)
    expect(storedTeams()).toEqual(expected)
  })

  it('imports a team as a new team with a new id', () => {
    seedStoredTeams([RAIN])
    const { result } = renderTeams()
    act(() => {
      result.current.importTeam({ name: 'Sun team', members: [{ species: 'vulpix', nickname: null }] })
    })
    expect(result.current.teams).toHaveLength(2)
    expect(result.current.teams[1].id).not.toBe(ID_A)
    expect(storedTeams()).toEqual(result.current.teams)
  })
})

describe('TeamsProvider: rule violations change nothing', () => {
  const FULL: Team = {
    ...RAIN,
    members: ['a', 'b', 'c', 'd', 'e', 'f'].map((species) => ({ species, nickname: null })),
  }

  it('rejects a 7th member with the T1 message, leaving state and storage unchanged', () => {
    seedStoredTeams([FULL])
    const before = stored()
    const { result } = renderTeams()
    let outcome
    act(() => {
      outcome = result.current.addMember(ID_A, 'mewtwo')
    })
    expect(outcome).toEqual({
      ok: false,
      message: 'Rain team is full (6 of 6).',
    })
    expect(result.current.teams).toEqual([FULL])
    expect(stored()).toBe(before)
  })

  it('rejects a duplicate team name', () => {
    seedStoredTeams([RAIN])
    const { result } = renderTeams()
    let outcome
    act(() => {
      outcome = result.current.createTeam(' rain TEAM ')
    })
    expect(outcome).toEqual({ ok: false, message: "A team called 'Rain team' already exists." })
    expect(result.current.teams).toEqual([RAIN])
  })

  it('rejects importing a team whose name already exists', () => {
    seedStoredTeams([RAIN])
    const { result } = renderTeams()
    let outcome
    act(() => {
      outcome = result.current.importTeam({ name: 'RAIN TEAM', members: [] })
    })
    expect(outcome).toMatchObject({ ok: false })
    expect(result.current.teams).toEqual([RAIN])
  })

  it('does not save when a move changes nothing', () => {
    const storage = { getItem: () => JSON.stringify({ version: 1, teams: [RAIN] }), setItem: vi.fn() }
    const { result } = renderTeams(storage)
    act(() => {
      result.current.moveMember(ID_A, 0, 'up')
    })
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})

describe('TeamsProvider: paused saving (salvaged, unreadable, newer version)', () => {
  const salvagedText = JSON.stringify({ version: 1, teams: [RAIN, { ...SUN, name: '' }] })

  it.each([
    ['salvaged', salvagedText, [RAIN]],
    ['unreadable', '{not json', []],
    ['newer-version', JSON.stringify({ version: 99, teams: [RAIN] }), []],
  ])('%s: refuses every change and leaves the stored text unchanged', (status, text, teams) => {
    seedStoredTeams(text)
    const { result } = renderTeams()
    expect(result.current.storage).toMatchObject({ status, original: text })
    expect(result.current.savingPaused).toBe(true)
    expect(result.current.teams).toEqual(teams)

    const refused = { ok: false, message: SAVING_PAUSED_MESSAGE }
    act(() => {
      expect(result.current.createTeam('Hail team')).toEqual(refused)
      expect(result.current.addMember(ID_A, 'snorlax')).toEqual(refused)
      expect(result.current.deleteTeam(ID_A)).toEqual(refused)
      expect(result.current.importTeam({ name: 'Hail team', members: [] })).toEqual(refused)
    })
    expect(result.current.teams).toEqual(teams)
    expect(stored()).toBe(text)
  })

  it('reports how many teams were dropped', () => {
    seedStoredTeams(salvagedText)
    const { result } = renderTeams()
    expect(result.current.storage).toEqual({ status: 'salvaged', dropped: 1, original: salvagedText })
  })

  it('"keep the valid teams" saves the cleaned teams and unpauses', () => {
    seedStoredTeams(salvagedText)
    const { result } = renderTeams()
    act(() => result.current.resolveStorage('keep-valid'))
    expect(result.current.storage).toEqual({ status: 'ok' })
    expect(storedTeams()).toEqual([RAIN])
    act(() => {
      result.current.createTeam('Hail team')
    })
    expect(storedTeams()).toHaveLength(2)
  })

  it.each([
    ['unreadable', '{not json'],
    ['newer-version', JSON.stringify({ version: 99, teams: [RAIN] })],
  ])('%s: "start with no teams" replaces the stored data with no teams', (_status, text) => {
    seedStoredTeams(text)
    const { result } = renderTeams()
    act(() => result.current.resolveStorage('start-over'))
    expect(result.current.storage).toEqual({ status: 'ok' })
    expect(result.current.teams).toEqual([])
    expect(storedTeams()).toEqual([])
  })

  it('ignores a choice that does not fit the situation', () => {
    seedStoredTeams('{not json')
    const { result } = renderTeams()
    act(() => result.current.resolveStorage('keep-valid'))
    expect(result.current.storage.status).toBe('unreadable')
    expect(stored()).toBe('{not json')
  })
})

describe('TeamsProvider: storage problems', () => {
  it('works in memory when the browser blocks storage', () => {
    const { result } = renderTeams(null)
    expect(result.current.storage).toEqual({ status: 'unavailable' })
    act(() => {
      result.current.createTeam('Rain team')
    })
    expect(result.current.teams).toHaveLength(1)
    expect(result.current.storage).toEqual({ status: 'unavailable' })
  })

  it('keeps the teams and reports save-failed when storage is full, then recovers', () => {
    let full = true
    const storage: TeamStorage = {
      getItem: () => null,
      setItem: (key, value) => {
        if (full) throw new DOMException('full', 'QuotaExceededError')
        localStorage.setItem(key, value)
      },
    }
    const { result } = renderTeams(storage)
    act(() => {
      result.current.createTeam('Rain team')
    })
    expect(result.current.storage).toEqual({ status: 'save-failed' })
    expect(result.current.teams.map((t) => t.name)).toEqual(['Rain team'])
    expect(result.current.savingPaused).toBe(false)

    full = false
    act(() => {
      result.current.createTeam('Sun team')
    })
    expect(result.current.storage).toEqual({ status: 'ok' })
    expect(storedTeams().map((t) => t.name)).toEqual(['Rain team', 'Sun team'])
  })
})

describe('TeamsProvider: changes from another tab', () => {
  it('replaces the teams with valid teams saved by another tab', () => {
    seedStoredTeams([RAIN])
    const { result } = renderTeams()
    saveFromAnotherTab(JSON.stringify({ version: 1, teams: [RAIN, SUN] }))
    expect(result.current.teams).toEqual([RAIN, SUN])
    expect(result.current.storage).toEqual({ status: 'ok' })
  })

  it('follows the usual load rules for garbage, and does not overwrite it', () => {
    seedStoredTeams([RAIN])
    const { result } = renderTeams()
    saveFromAnotherTab('garbage')
    expect(result.current.storage).toEqual({ status: 'unreadable', original: 'garbage' })
    expect(result.current.teams).toEqual([])
    expect(stored()).toBe('garbage')
  })

  it('ignores changes to other keys', () => {
    seedStoredTeams([RAIN])
    const { result } = renderTeams()
    act(() => {
      localStorage.setItem(TEAMS_STORAGE_KEY, 'garbage')
      window.dispatchEvent(new StorageEvent('storage', { key: 'something.else', newValue: 'x' }))
    })
    expect(result.current.teams).toEqual([RAIN])
  })

  it('stops listening once the provider is gone', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderTeams()
    unmount()
    expect(removeListener).toHaveBeenCalledWith('storage', expect.any(Function))
    vi.restoreAllMocks()
  })
})

describe('TeamsProvider: selected team', () => {
  it('starts with none, can select one, and forgets it when that team is deleted', () => {
    seedStoredTeams([RAIN, SUN])
    const { result } = renderTeams()
    expect(result.current.selectedTeam).toBeNull()
    act(() => result.current.selectTeam(ID_B))
    expect(result.current.selectedTeam).toEqual(SUN)
    act(() => {
      result.current.deleteTeam(ID_B)
    })
    expect(result.current.selectedTeam).toBeNull()
  })

  it('is not saved', () => {
    seedStoredTeams([RAIN])
    const before = stored()
    const { result } = renderTeams()
    act(() => result.current.selectTeam(ID_A))
    expect(stored()).toBe(before)
  })
})
