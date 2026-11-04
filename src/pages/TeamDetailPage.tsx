import { Link, useParams } from 'react-router'
import { StorageNotice } from '../components/StorageNotice.tsx'
import { MAX_TEAM_SIZE, teamIdSchema } from '../domain/team.ts'
import { useTeams } from '../teams/useTeams.ts'
import { NotFoundPage } from './NotFoundPage.tsx'

// /teams/:teamId. For now only a placeholder with the team's name; the members, reordering
// and nicknames come in T6.
export function TeamDetailPage() {
  const { teamId = '' } = useParams()
  const { teams } = useTeams()

  // The id comes from the address bar, so it is checked before use (decision D10). An id that
  // isn't shaped like a team id, or that no team has, gets the shared not-found page.
  const team = teamIdSchema.safeParse(teamId).success
    ? teams.find((t) => t.id === teamId)
    : undefined
  // With a storage problem the team may simply not have been readable, so the notice is
  // shown here too, explaining why and offering the way out (T5)
  if (team === undefined) {
    return (
      <>
        <NotFoundPage />
        <StorageNotice />
      </>
    )
  }

  return (
    <>
      <h1>{team.name}</h1>
      <StorageNotice />
      <p>
        {team.members.length}/{MAX_TEAM_SIZE} Pokémon
      </p>
      <p>
        <Link to="/teams">Back to your teams</Link>
      </p>
    </>
  )
}
