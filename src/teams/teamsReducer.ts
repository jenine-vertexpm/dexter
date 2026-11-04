import type { Team, TeamsResult } from '../domain/team.ts'
import type { LoadResult, SaveResult } from '../storage/teamStorage.ts'

// The teams state and every way it can change (decision D8). A "reducer" is a plain function:
// given the current state and an action describing what happened, it returns the next state.
// It never changes the old state and has no side effects; saving happens in TeamsProvider.

// What the UI needs to know about browser storage (M3 plan §4.1)
export type StorageState =
  | { status: 'ok' } // loading and saving work normally
  | { status: 'unavailable' } // the browser blocks storage: teams work, but only in this tab
  | { status: 'save-failed' } // the last save failed (storage full); teams are kept in memory
  // The next three pause saving until the user chooses what to do (T5). `original` is the
  // stored text, for the "download" button.
  | { status: 'salvaged'; dropped: number; original: string }
  | { status: 'unreadable'; original: string }
  | { status: 'newer-version'; original: string }

export interface TeamsState {
  teams: Team[]
  storage: StorageState
  // True when the teams have changed and haven't been written to storage yet
  saveRequested: boolean
  // The team that "Add to team" buttons add to (§4.4). Kept in memory only, never saved.
  selectedTeamId: string | null
}

export type TeamsAction =
  // A change made with one of the T1 operations, e.g. (teams) => addMember(teams, id, 'eevee')
  | { type: 'change'; apply: (teams: Team[]) => TeamsResult }
  // Storage was read again, because another tab changed it (D17)
  | { type: 'loaded'; result: LoadResult }
  // A save finished. `teams` is what was saved, so a newer change isn't marked as saved by mistake.
  | { type: 'saved'; teams: Team[]; result: SaveResult }
  // The user's choice when saving is paused (T5)
  | { type: 'resolve'; choice: 'keep-valid' | 'start-over' }
  | { type: 'select'; teamId: string | null }

// While stored data is waiting for the user's decision, nothing may change or be saved,
// so the original can't be overwritten by accident (D14).
export function isSavingPaused(storage: StorageState): boolean {
  return (
    storage.status === 'salvaged' ||
    storage.status === 'unreadable' ||
    storage.status === 'newer-version'
  )
}

export const SAVING_PAUSED_MESSAGE =
  "Your saved teams need your attention before they can be changed. Choose what to do with them first."

// Turns what loadTeams found into the teams to show and the storage status
function fromLoad(result: LoadResult): Pick<TeamsState, 'teams' | 'storage'> {
  switch (result.status) {
    case 'empty':
      return { teams: [], storage: { status: 'ok' } }
    case 'ok':
      return { teams: result.teams, storage: { status: 'ok' } }
    case 'salvaged':
      return {
        teams: result.teams,
        storage: { status: 'salvaged', dropped: result.dropped, original: result.original },
      }
    case 'unreadable':
    case 'newer-version':
      return { teams: [], storage: { status: result.status, original: result.original } }
    case 'unavailable':
      return { teams: [], storage: { status: 'unavailable' } }
  }
}

export function initialTeamsState(result: LoadResult): TeamsState {
  return { ...fromLoad(result), saveRequested: false, selectedTeamId: null }
}

export function teamsReducer(state: TeamsState, action: TeamsAction): TeamsState {
  switch (action.type) {
    case 'change': {
      if (isSavingPaused(state.storage)) return state
      const result = action.apply(state.teams)
      // A refused change, or one that changes nothing (e.g. moving the top member up), leaves
      // the state exactly as it was, so there is nothing to save
      if (!result.ok || result.value === state.teams) return state
      return { ...state, teams: result.value, saveRequested: true }
    }

    case 'loaded':
      // Replaces this tab's teams with what is now stored ("last save wins", §4.3)
      return { ...state, ...fromLoad(action.result), saveRequested: false }

    case 'saved': {
      if (action.teams !== state.teams) return state // a newer change still needs saving
      const saved = { ...state, saveRequested: false }
      if (action.result.ok) return { ...saved, storage: { status: 'ok' } }
      if (action.result.error === 'quota') return { ...saved, storage: { status: 'save-failed' } }
      return { ...saved, storage: { status: 'unavailable' } }
    }

    case 'resolve': {
      const { status } = state.storage
      // "Keep the valid teams" saves the teams that were readable, replacing the original
      if (action.choice === 'keep-valid' && status === 'salvaged') {
        return { ...state, storage: { status: 'ok' }, saveRequested: true }
      }
      // "Start with no teams" replaces the original with an empty list
      if (action.choice === 'start-over' && (status === 'unreadable' || status === 'newer-version')) {
        return { ...state, teams: [], storage: { status: 'ok' }, saveRequested: true }
      }
      return state
    }

    case 'select':
      return { ...state, selectedTeamId: action.teamId }
  }
}
