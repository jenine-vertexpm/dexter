import type { Team } from '../domain/team.ts'
import { useTeams } from './useTeams.ts'

// The team that "Add to team" buttons add to (M3 plan T7, §4.4): the one picked in TeamPicker,
// or the first team until one is picked. Worked out from the shared team state each time, never
// stored twice. If the picked team is deleted, TeamsProvider forgets it and this falls back to
// the first team. Null when there are no teams.
export function useTargetTeam(): Team | null {
  const { teams, selectedTeam } = useTeams()
  return selectedTeam ?? teams[0] ?? null
}
