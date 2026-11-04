import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Team } from '../domain/team.ts'
import {
  getBrowserStorage,
  loadTeams,
  runMigrations,
  saveTeams,
  STORAGE_VERSION,
  TEAMS_STORAGE_KEY,
  type Migrations,
  type TeamStorage,
} from './teamStorage.ts'

const ID_A = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'
const ID_B = '0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d'
const ID_C = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f'

const RAIN: Team = {
  id: ID_A,
  name: 'Rain team',
  members: [
    { species: 'pikachu', nickname: 'Sparky' },
    { species: 'mr-mime', nickname: null },
  ],
}
const SUN: Team = { id: ID_B, name: 'Sun team', members: [] }

function members(...species: string[]) {
  return species.map((name) => ({ species: name, nickname: null }))
}

// Puts raw text in storage, exactly as a user editing it in DevTools could
function store(text: string) {
  localStorage.setItem(TEAMS_STORAGE_KEY, text)
}

function storeEnvelope(teams: unknown[], version: unknown = STORAGE_VERSION) {
  store(JSON.stringify({ version, teams }))
}

function stored() {
  return localStorage.getItem(TEAMS_STORAGE_KEY)
}

// A fake storage whose methods throw the given errors
function throwingStorage(errors: { get?: Error; set?: Error }): TeamStorage {
  return {
    getItem: () => {
      if (errors.get) throw errors.get
      return null
    },
    setItem: () => {
      if (errors.set) throw errors.set
    },
  }
}

const securityError = () => new DOMException('The operation is insecure.', 'SecurityError')
const quotaError = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')

describe('loadTeams: basics', () => {
  it('reports empty when nothing is saved', () => {
    expect(loadTeams(localStorage)).toEqual({ status: 'empty' })
  })

  it('reads back what saveTeams wrote', () => {
    expect(saveTeams(localStorage, [RAIN, SUN])).toEqual({ ok: true })
    expect(loadTeams(localStorage)).toEqual({ status: 'ok', teams: [RAIN, SUN] })
  })

  it('saves under one key as { version, teams }', () => {
    saveTeams(localStorage, [SUN])
    expect(JSON.parse(stored() ?? '')).toEqual({ version: 1, teams: [SUN] })
  })

  it('treats a saved empty list as ok, not empty', () => {
    saveTeams(localStorage, [])
    expect(loadTeams(localStorage)).toEqual({ status: 'ok', teams: [] })
  })

  it('drops unknown keys without counting the team as invalid', () => {
    store(JSON.stringify({ version: 1, teams: [{ ...SUN, colour: 'red' }], extra: true }))
    expect(loadTeams(localStorage)).toEqual({ status: 'ok', teams: [SUN] })
  })

  it('never writes to storage', () => {
    const storage: TeamStorage = { getItem: () => '{"version":1,"teams":[{}]}', setItem: vi.fn() }
    loadTeams(storage)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})

describe('loadTeams: unreadable', () => {
  it.each([
    ['invalid JSON', '{"version":1,"teams":['],
    ['null', 'null'],
    ['an array', '[]'],
    ['a number', '42'],
    ['a missing version', '{"teams":[]}'],
    ['a version that is text', '{"version":"1","teams":[]}'],
    ['a version that is not a whole number', '{"version":0.5,"teams":[]}'],
    ['version 0, which has no migration', '{"version":0,"teams":[]}'],
    ['missing teams', '{"version":1}'],
    ['teams that are not a list', '{"version":1,"teams":{"a":1}}'],
  ])('reports %s as unreadable, keeping the original text', (_label, text) => {
    store(text)
    expect(loadTeams(localStorage)).toEqual({ status: 'unreadable', original: text })
    expect(stored()).toBe(text)
  })
})

describe('loadTeams: newer version', () => {
  it('does not try to read data from a newer version, and leaves it as it was', () => {
    const text = JSON.stringify({ version: 99, teams: [RAIN] })
    store(text)
    expect(loadTeams(localStorage)).toEqual({ status: 'newer-version', original: text })
    expect(stored()).toBe(text)
  })

  it('reports newer-version even when the rest of the data would not make sense to us', () => {
    store('{"version":2,"somethingNew":true}')
    expect(loadTeams(localStorage).status).toBe('newer-version')
  })
})

describe('loadTeams: salvaged', () => {
  it.each([
    ['7 members', { id: ID_C, name: 'Big team', members: members('a', 'b', 'c', 'd', 'e', 'f', 'g') }],
    ['the same species twice', { id: ID_C, name: 'Twins', members: members('pikachu', 'pikachu') }],
    [
      'a 13-character nickname',
      { id: ID_C, name: 'Long names', members: [{ species: 'eevee', nickname: 'Abcdefghijklm' }] },
    ],
    ['a name that clashes with an earlier team', { id: ID_C, name: 'RAIN TEAM', members: [] }],
    ['an id that repeats an earlier team', { ...SUN, id: ID_A }],
    ['an id that is not a UUID', { ...SUN, id: 'not-a-uuid' }],
    ['something that is not a team at all', 'hello'],
  ])('drops a team with %s, keeps the rest, and leaves storage unchanged', (_label, bad) => {
    storeEnvelope([RAIN, bad, SUN])
    const text = stored()
    expect(loadTeams(localStorage)).toEqual({
      status: 'salvaged',
      teams: [RAIN, SUN],
      dropped: 1,
      original: text,
    })
    expect(stored()).toBe(text)
  })

  it('keeps the first of two teams with clashing names', () => {
    const later = { id: ID_B, name: ' rain team ', members: members('snorlax') }
    storeEnvelope([RAIN, later])
    const result = loadTeams(localStorage)
    expect(result.status).toBe('salvaged')
    expect(result.status === 'salvaged' && result.teams).toEqual([RAIN])
  })

  it('counts every dropped team', () => {
    storeEnvelope([null, RAIN, 42, { ...RAIN, id: ID_B }])
    expect(loadTeams(localStorage)).toMatchObject({ status: 'salvaged', teams: [RAIN], dropped: 3 })
  })

  it('reports salvaged with no teams left when every team is invalid', () => {
    storeEnvelope([{}, []])
    expect(loadTeams(localStorage)).toMatchObject({ status: 'salvaged', teams: [], dropped: 2 })
  })
})

describe('loadTeams and saveTeams: storage errors', () => {
  it('reports unavailable when reading storage throws a SecurityError', () => {
    expect(loadTeams(throwingStorage({ get: securityError() }))).toEqual({ status: 'unavailable' })
  })

  it('reports unavailable when there is no storage at all', () => {
    expect(loadTeams(null)).toEqual({ status: 'unavailable' })
    expect(saveTeams(null, [RAIN])).toEqual({ ok: false, error: 'unavailable' })
  })

  it('reports quota when storage is full, without throwing', () => {
    expect(saveTeams(throwingStorage({ set: quotaError() }), [RAIN])).toEqual({
      ok: false,
      error: 'quota',
    })
  })

  it('also recognises the old Firefox name for a full storage', () => {
    const firefox = new DOMException('full', 'NS_ERROR_DOM_QUOTA_REACHED')
    expect(saveTeams(throwingStorage({ set: firefox }), [RAIN])).toEqual({ ok: false, error: 'quota' })
  })

  it('reports unavailable when saving throws anything else', () => {
    expect(saveTeams(throwingStorage({ set: securityError() }), [RAIN])).toEqual({
      ok: false,
      error: 'unavailable',
    })
    expect(saveTeams(throwingStorage({ set: new Error('odd') }), [RAIN])).toEqual({
      ok: false,
      error: 'unavailable',
    })
  })
})

describe('getBrowserStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the browser's localStorage", () => {
    expect(getBrowserStorage()).toBe(window.localStorage)
  })

  it('returns null when merely touching localStorage throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw securityError()
    })
    expect(getBrowserStorage()).toBeNull()
  })
})

describe('runMigrations', () => {
  // Test-only upgrades: each one records that it ran and adds a field
  function testMigrations(calls: number[]): Migrations {
    return {
      1: (data) => {
        calls.push(1)
        return { ...(data as object), addedIn2: true }
      },
      2: (data) => {
        calls.push(2)
        return { ...(data as object), addedIn3: true }
      },
    }
  }

  it('runs each upgrade in order', () => {
    const calls: number[] = []
    const result = runMigrations({ teams: [] }, 1, 3, testMigrations(calls))
    expect(calls).toEqual([1, 2])
    expect(result).toEqual({ ok: true, data: { teams: [], addedIn2: true, addedIn3: true } })
  })

  it('starts from the stored version', () => {
    const calls: number[] = []
    runMigrations({ teams: [] }, 2, 3, testMigrations(calls))
    expect(calls).toEqual([2])
  })

  it('does nothing when already at the current version', () => {
    const data = { teams: [] }
    expect(runMigrations(data, 3, 3, {})).toEqual({ ok: true, data })
  })

  it('refuses a gap in the upgrades', () => {
    const calls: number[] = []
    const gap: Migrations = { 1: testMigrations(calls)[1], 3: (data) => data }
    expect(runMigrations({ teams: [] }, 1, 4, gap)).toEqual({ ok: false })
  })

  it('refuses data an upgrade throws on', () => {
    const broken: Migrations = {
      1: () => {
        throw new Error('unexpected shape')
      },
    }
    expect(runMigrations({}, 1, 2, broken)).toEqual({ ok: false })
  })
})

describe('loadTeams with migrations', () => {
  // Pretend the app is at version 2, with a test-only upgrade from 1 to 2 that trims team names.
  // (It throws if `teams` isn't a list, like a real upgrade meeting data it doesn't expect.)
  const toVersion2: Migrations = {
    1: (data) => {
      const { teams, ...rest } = data as { teams: unknown }
      return { ...rest, teams: (teams as Team[]).map((team) => ({ ...team, name: team.name.trim() })) }
    },
  }

  it('upgrades older data, then validates it as usual', () => {
    store(JSON.stringify({ version: 1, teams: [{ ...RAIN, name: ' Rain team ' }] }))
    expect(loadTeams(localStorage, { version: 2, migrations: toVersion2 })).toEqual({
      status: 'ok',
      teams: [RAIN],
    })
  })

  it('salvages upgraded data that still has invalid teams', () => {
    storeEnvelope([RAIN, { ...SUN, name: '' }])
    expect(loadTeams(localStorage, { version: 2, migrations: toVersion2 })).toMatchObject({
      status: 'salvaged',
      teams: [RAIN],
      dropped: 1,
    })
  })

  it('reports older data without an upgrade path as unreadable', () => {
    storeEnvelope([RAIN])
    expect(loadTeams(localStorage, { version: 2, migrations: {} }).status).toBe('unreadable')
  })

  it('reports data an upgrade throws on as unreadable, keeping the original', () => {
    store('{"version":1,"teams":"oops"}')
    const result = loadTeams(localStorage, { version: 2, migrations: toVersion2 })
    expect(result).toEqual({ status: 'unreadable', original: '{"version":1,"teams":"oops"}' })
  })

  it('does not write the upgraded data back', () => {
    const text = JSON.stringify({ version: 1, teams: [RAIN] })
    store(text)
    loadTeams(localStorage, { version: 2, migrations: toVersion2 })
    expect(stored()).toBe(text)
  })
})
