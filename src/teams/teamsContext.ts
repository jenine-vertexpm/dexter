import { createContext } from 'react'
import type { Team, TeamMember, TeamsResult } from '../domain/team.ts'
import type { StorageState } from './teamsReducer.ts'

// Everything components can read and do with teams. Provided by TeamsProvider, read with useTeams().
// User-owned teams live here; Pokémon data from the API stays in TanStack Query (decision D8).
export interface TeamsContextValue {
  teams: Team[]
  storage: StorageState
  // True while stored data waits for the user's choice (salvaged, unreadable, newer-version).
  // Every change action is refused meanwhile, with SAVING_PAUSED_MESSAGE.
  savingPaused: boolean

  // Each action returns the T1 result: ok, or a message to show the user. On failure nothing changes.
  createTeam: (name: string) => TeamsResult
  renameTeam: (teamId: string, name: string) => TeamsResult
  deleteTeam: (teamId: string) => TeamsResult
  addMember: (teamId: string, species: string) => TeamsResult
  removeMember: (teamId: string, species: string) => TeamsResult
  moveMember: (teamId: string, index: number, direction: 'up' | 'down') => TeamsResult
  setNickname: (teamId: string, species: string, nickname: string | null) => TeamsResult
  importTeam: (team: { name: string; members: TeamMember[] }) => TeamsResult

  // The user's choice when saving is paused (T5)
  resolveStorage: (choice: 'keep-valid' | 'start-over') => void

  // The team that "Add to team" buttons add to (§4.4); null if none is chosen or it was deleted
  selectedTeam: Team | null
  selectTeam: (teamId: string | null) => void
}

export const TeamsContext = createContext<TeamsContextValue | null>(null)
