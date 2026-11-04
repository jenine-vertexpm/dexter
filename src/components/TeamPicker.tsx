import { useId } from 'react'
import { Link } from 'react-router'
import { MAX_TEAM_SIZE } from '../domain/team.ts'
import { useTargetTeam } from '../teams/useTargetTeam.ts'
import { useTeams } from '../teams/useTeams.ts'
import './AddToTeam.css'

// "Add Pokémon to: [Rain team (4/6)]", above the Pokémon list and on a Pokémon's page
// (M3 plan T7, §4.4). One picker per page, instead of one per card, keeps cards small at 360px.
// The choice is kept in TeamsProvider (in memory only), so it is the same on every page.
export function TeamPicker() {
  const { teams, savingPaused, selectTeam } = useTeams()
  const target = useTargetTeam()
  const selectId = useId()
  const reasonId = useId()

  // Saved teams are waiting for a recovery choice (T5): nothing can be added until then
  const pausedReason = savingPaused && (
    <p id={reasonId} className="team-picker-note">
      Adding Pokémon is paused until you choose what to do with your saved teams.{' '}
      <Link to="/teams">Go to your teams</Link>
    </p>
  )

  if (target === null) {
    return (
      <div className="team-picker">
        {pausedReason || (
          <p className="team-picker-note">
            To add Pokémon to a team, you need a team. <Link to="/teams">Create a team first</Link>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="team-picker">
      <label htmlFor={selectId}>Add Pokémon to:</label>
      <select
        id={selectId}
        value={target.id}
        onChange={(event) => selectTeam(event.target.value)}
        disabled={savingPaused}
        aria-describedby={savingPaused ? reasonId : undefined}
      >
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {`${team.name} (${team.members.length}/${MAX_TEAM_SIZE})`}
          </option>
        ))}
      </select>
      {pausedReason}
    </div>
  )
}
