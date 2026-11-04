import { useContext } from 'react'
import { TeamsContext, type TeamsContextValue } from './teamsContext.ts'

// The teams and the actions that change them. Must be used inside <TeamsProvider>.
export function useTeams(): TeamsContextValue {
  const value = useContext(TeamsContext)
  if (value === null) throw new Error('useTeams must be used inside <TeamsProvider>')
  return value
}
