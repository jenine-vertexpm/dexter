import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import * as rules from '../domain/team.ts'
import type { Team, TeamsResult } from '../domain/team.ts'
import {
  getBrowserStorage,
  loadTeams,
  saveTeams,
  TEAMS_STORAGE_KEY,
  type TeamStorage,
} from '../storage/teamStorage.ts'
import { TeamsContext, type TeamsContextValue } from './teamsContext.ts'
import {
  initialTeamsState,
  isSavingPaused,
  SAVING_PAUSED_MESSAGE,
  teamsReducer,
} from './teamsReducer.ts'

// Holds the user's teams for the whole app (decision D8): React Context shares them with every
// component, and a reducer (teamsReducer.ts) decides how they change, using the T1 rules.
// This component adds the side effects: reading storage at the start, saving after each change,
// and following changes made in other tabs.
//
// `storage` is only passed in tests. Normally it is the browser's localStorage, or null when
// the browser blocks it.
export function TeamsProvider({
  children,
  storage: storageOverride,
}: {
  children: ReactNode
  storage?: TeamStorage | null
}) {
  // Decided once, on the first render
  const [storage] = useState(() =>
    storageOverride === undefined ? getBrowserStorage() : storageOverride,
  )
  // The third argument makes the load happen once, on the first render only
  const [state, dispatch] = useReducer(teamsReducer, storage, (s) => initialTeamsState(loadTeams(s)))

  // Save after each change. Runs after React has updated the screen, with the latest teams.
  useEffect(() => {
    if (!state.saveRequested) return
    dispatch({ type: 'saved', teams: state.teams, result: saveTeams(storage, state.teams) })
  }, [state.saveRequested, state.teams, storage])

  // Another tab saved teams: read storage again, with the usual checks (D17, plan §4.3).
  // The browser only sends this event to *other* tabs, never to the one that saved.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      // key is null when the other tab cleared all of storage
      if (event.key !== TEAMS_STORAGE_KEY && event.key !== null) return
      dispatch({ type: 'loaded', result: loadTeams(storage) })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storage])

  const value = useMemo((): TeamsContextValue => {
    const savingPaused = isSavingPaused(state.storage)

    // Runs a T1 operation. The result is worked out here so the caller gets the message straight
    // away; the reducer then applies the same operation to the latest state.
    function change(apply: (teams: Team[]) => TeamsResult): TeamsResult {
      if (savingPaused) return { ok: false, message: SAVING_PAUSED_MESSAGE }
      const result = apply(state.teams)
      if (result.ok) dispatch({ type: 'change', apply })
      return result
    }

    return {
      teams: state.teams,
      storage: state.storage,
      savingPaused,

      createTeam: (name) => {
        const id = rules.newTeamId() // made once, so this result and the reducer agree on it
        return change((teams) => rules.createTeam(teams, name, id))
      },
      renameTeam: (teamId, name) => change((teams) => rules.renameTeam(teams, teamId, name)),
      deleteTeam: (teamId) => change((teams) => rules.deleteTeam(teams, teamId)),
      addMember: (teamId, species) => change((teams) => rules.addMember(teams, teamId, species)),
      removeMember: (teamId, species) =>
        change((teams) => rules.removeMember(teams, teamId, species)),
      moveMember: (teamId, index, direction) =>
        change((teams) => rules.moveMember(teams, teamId, index, direction)),
      setNickname: (teamId, species, nickname) =>
        change((teams) => rules.setNickname(teams, teamId, species, nickname)),
      importTeam: (team) => {
        const id = rules.newTeamId()
        return change((teams) => rules.addImportedTeam(teams, team, id))
      },

      resolveStorage: (choice) => dispatch({ type: 'resolve', choice }),

      selectedTeam: state.teams.find((team) => team.id === state.selectedTeamId) ?? null,
      selectTeam: (teamId) => dispatch({ type: 'select', teamId }),
    }
  }, [state.teams, state.storage, state.selectedTeamId])

  return <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>
}
