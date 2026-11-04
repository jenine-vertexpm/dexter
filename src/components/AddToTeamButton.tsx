import { useState } from 'react'
import { Link } from 'react-router'
import { useTargetTeam } from '../teams/useTargetTeam.ts'
import { useTeams } from '../teams/useTeams.ts'
import './AddToTeam.css'

// "Add to Rain team" for one Pokémon, on a list card and on its detail page (M3 plan T7).
// `species` is the species name, the only thing a team stores about a Pokémon (D10).
//
// The T1 rule (addMember, through TeamsProvider) decides whether the Pokémon can be added: a
// full team or a species already in the team is refused with a message and nothing changes.
// The result appears just below the button, in a live region, so screen readers read it out.
export function AddToTeamButton({ species }: { species: string }) {
  const { addMember, savingPaused } = useTeams()
  const team = useTargetTeam()
  const [result, setResult] = useState<{ message: string; teamId: string; teamName: string } | null>(
    null,
  )

  // No teams: TeamPicker shows the "Create a team first" link instead
  if (team === null) return null

  function add() {
    if (team === null) return
    const added = addMember(team.id, species)
    setResult({
      message: added.ok ? `Added ${species} to ${team.name}.` : added.message,
      teamId: team.id,
      teamName: team.name,
    })
  }

  return (
    <div className="add-to-team">
      {/* The accessible name starts with the visible text (so voice control works) and adds the
          Pokémon, so a screen reader can tell the 20 buttons on a page apart */}
      <button
        type="button"
        onClick={add}
        disabled={savingPaused}
        aria-label={`Add to ${team.name} (${species})`}
      >
        Add to {team.name}
      </button>
      {/* Always in the page, so the text that appears in it is announced */}
      <p role="status" className="add-to-team-result">
        {result?.message}
      </p>
      {result && (
        <Link to={`/teams/${result.teamId}`} className="add-to-team-link">
          View {result.teamName}
        </Link>
      )}
    </div>
  )
}
