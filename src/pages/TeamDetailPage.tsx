import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { StorageNotice } from '../components/StorageNotice.tsx'
import { TeamAnalysis } from '../components/TeamAnalysis.tsx'
import { TeamMemberCard } from '../components/TeamMemberCard.tsx'
import * as rules from '../domain/team.ts'
import { MAX_TEAM_SIZE, teamIdSchema } from '../domain/team.ts'
import { teamFileName, teamFileText } from '../domain/teamFile.ts'
import { downloadText } from '../lib/download.ts'
import { useTeams } from '../teams/useTeams.ts'
import { NotFoundPage } from './NotFoundPage.tsx'
import './TeamDetailPage.css'

// /teams/:teamId: one team's Pokémon, in order, with remove, move up/down and nicknames
// (M3 plan T6). Every change goes through the shared team state, which saves it (T3).
export function TeamDetailPage() {
  const { teamId = '' } = useParams()
  const { teams, savingPaused, removeMember, moveMember, setNickname } = useTeams()
  // Read out by screen readers after a change, e.g. "eevee moved to position 1 of 3."
  const [announcement, setAnnouncement] = useState('')
  // After a Remove the card is gone, so focus moves to the list's heading instead of being lost
  const membersHeading = useRef<HTMLHeadingElement>(null)

  // Every Move button on the page, by "species:direction", e.g. "eevee:up"
  const moveButtons = useRef(new Map<string, HTMLButtonElement>())
  // After a move, which button to focus once the list has been redrawn in its new order
  const focusAfterMove = useRef<{ species: string; direction: 'up' | 'down' } | null>(null)

  // The id comes from the address bar, so it is checked before use (decision D10)
  const team = teamIdSchema.safeParse(teamId).success
    ? teams.find((t) => t.id === teamId)
    : undefined

  // Runs after each change to the members. Keeps focus on the moved Pokémon's button; if that
  // button is now disabled (it reached the top or bottom), its other Move button gets focus.
  useEffect(() => {
    const request = focusAfterMove.current
    if (request === null) return
    focusAfterMove.current = null
    const other = request.direction === 'up' ? 'down' : 'up'
    const same = moveButtons.current.get(`${request.species}:${request.direction}`)
    const fallback = moveButtons.current.get(`${request.species}:${other}`)
    ;(same && !same.disabled ? same : fallback)?.focus()
  }, [team?.members])

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
  // Taken out here, after the not-found check, so the functions below know the team exists
  const { id, name, members } = team

  function move(species: string, index: number, direction: 'up' | 'down') {
    const result = moveMember(id, index, direction)
    if (!result.ok) {
      setAnnouncement(result.message)
      return
    }
    const newPosition = direction === 'up' ? index : index + 2 // counted from 1
    focusAfterMove.current = { species, direction }
    setAnnouncement(`${species} moved to position ${newPosition} of ${members.length}.`)
  }

  // Saves the team as a JSON file (M3 plan §4.2). The browser shows the download; the
  // announcement tells screen reader users it happened.
  function exportTeam() {
    downloadText(teamFileName(name), teamFileText({ id, name, members }))
    setAnnouncement(`Exported ${name}.`)
  }

  function remove(species: string) {
    const result = removeMember(id, species)
    setAnnouncement(result.ok ? `Removed ${species} from the team.` : result.message)
    if (result.ok) membersHeading.current?.focus()
  }

  // A "dry run" of the T1 nickname rule: works out the result without changing anything
  function checkNickname(species: string, text: string): string | null {
    const result = rules.setNickname(teams, id, species, text)
    return result.ok ? null : result.message
  }

  function saveNickname(species: string, text: string) {
    const result = setNickname(id, species, text)
    if (result.ok) {
      // The T1 rule turns empty or spaces-only text into null: no nickname
      const saved = rules.nicknameSchema.parse(text)
      setAnnouncement(saved === null ? `Removed the nickname from ${species}.` : `Saved the nickname ${saved}.`)
    }
    return result
  }

  return (
    <>
      <h1>{team.name}</h1>
      <StorageNotice />
      <p>
        {members.length}/{MAX_TEAM_SIZE} Pokémon
      </p>
      {/* Exporting only reads the team, so it stays available even while saving is paused:
          a downloaded copy is the way to keep a team safe then (T9) */}
      <p>
        <button type="button" onClick={exportTeam}>
          Export team
        </button>
      </p>

      {/* tabIndex={-1} lets code move focus here; it doesn't add a Tab stop */}
      <h2 ref={membersHeading} tabIndex={-1} className="team-members-heading">
        Members
      </h2>
      {members.length === 0 ? (
        <p>
          This team has no Pokémon yet. <Link to="/">Browse the Pokémon list</Link>
        </p>
      ) : (
        // An ordered list: the order is the team's order
        <ol className="team-members">
          {members.map((member, index) => (
            <TeamMemberCard
              // Keyed by species (each is in a team once), so a card keeps its state when it moves
              key={member.species}
              member={member}
              position={index}
              teamSize={members.length}
              disabled={savingPaused}
              moveButtonRef={(direction, button) => {
                const key = `${member.species}:${direction}`
                if (button) moveButtons.current.set(key, button)
                else moveButtons.current.delete(key)
              }}
              onMove={(direction) => move(member.species, index, direction)}
              onRemove={() => remove(member.species)}
              checkNickname={(text) => checkNickname(member.species, text)}
              saveNickname={(text) => saveNickname(member.species, text)}
            />
          ))}
        </ol>
      )}

      {/* Its own loading, error and empty states, so it never holds up the members above (T8) */}
      <TeamAnalysis species={members.map((member) => member.species)} />

      <p>
        <Link to="/teams">Back to your teams</Link>
      </p>

      {/* A live region: screen readers read out whatever text appears in it */}
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
    </>
  )
}
