import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { TeamNameForm } from '../components/TeamNameForm.tsx'
import * as rules from '../domain/team.ts'
import { MAX_TEAM_SIZE, type Team } from '../domain/team.ts'
import type { StorageState } from '../teams/teamsReducer.ts'
import { useTeams } from '../teams/useTeams.ts'
import './TeamsPage.css'

// A short line about storage when it isn't working normally. The full notices, with the
// download and recovery buttons, come in T5.
function storageNotice(storage: StorageState): string | null {
  switch (storage.status) {
    case 'ok':
      return null
    case 'unavailable':
      return "Your browser is blocking storage, so your teams won't be saved after you close this tab."
    case 'save-failed':
      return "Couldn't save your latest change because browser storage is full."
    case 'salvaged':
    case 'unreadable':
    case 'newer-version':
      return "There's a problem with your saved teams, so changes are paused for now."
  }
}

// /teams: create, rename and delete teams (M3 plan T4)
export function TeamsPage() {
  const { teams, storage, createTeam } = useTeams()
  // Read out by screen readers after a change, e.g. "Deleted 'Rain team'."
  const [announcement, setAnnouncement] = useState('')
  // After a delete the team's row is gone, so focus moves to the list heading instead of being lost
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const notice = storageNotice(storage)

  // A "dry run" of the T1 rule: it works out the result without changing anything
  function checkNewName(name: string): string | null {
    const result = rules.createTeam(teams, name)
    return result.ok ? null : result.message
  }

  function create(name: string) {
    const result = createTeam(name)
    if (result.ok) setAnnouncement(`Created '${name.trim()}'.`)
    return result
  }

  function handleDeleted(name: string) {
    setAnnouncement(`Deleted '${name}'.`)
    listHeadingRef.current?.focus()
  }

  return (
    <>
      <h1>Teams</h1>
      {notice !== null && <p className="storage-notice">{notice}</p>}

      <section className="team-create">
        <h2>Create a team</h2>
        <TeamNameForm
          label="Team name"
          submitLabel="Create team"
          check={checkNewName}
          submit={create}
          clearAfterSubmit
        />
      </section>

      <section>
        {/* tabIndex={-1} lets code move focus here; it doesn't add a Tab stop */}
        <h2 ref={listHeadingRef} tabIndex={-1} className="team-list-heading">
          Your teams
        </h2>
        {teams.length === 0 ? (
          <p>You don't have any teams yet. Create one above to get started.</p>
        ) : (
          <ul className="team-list">
            {teams.map((team) => (
              <TeamRow
                key={team.id}
                team={team}
                onRenamed={(name) => setAnnouncement(`Renamed to '${name}'.`)}
                onDeleted={handleDeleted}
              />
            ))}
          </ul>
        )}
      </section>

      {/* A live region: screen readers read out whatever text appears in it */}
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
    </>
  )
}

// One team in the list. It shows the team normally, or the rename form, or the delete
// question, one at a time.
function TeamRow({
  team,
  onRenamed,
  onDeleted,
}: {
  team: Team
  onRenamed: (name: string) => void
  onDeleted: (name: string) => void
}) {
  const { teams, renameTeam, deleteTeam } = useTeams()
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm-delete'>('view')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Keyboard users shouldn't lose their place when the row changes, so focus goes to the
  // button that makes sense next. `focusNext` says which one; it is used once, then cleared.
  const focusNext = useRef<'rename' | 'delete' | 'cancel-delete' | null>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const cancelDeleteButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const target = { rename: renameButton, delete: deleteButton, 'cancel-delete': cancelDeleteButton }
    if (focusNext.current !== null) target[focusNext.current].current?.focus()
    focusNext.current = null
  }, [mode])

  function show(next: typeof mode, focus: typeof focusNext.current) {
    focusNext.current = focus
    setDeleteError(null)
    setMode(next)
  }

  function checkRename(name: string): string | null {
    const result = rules.renameTeam(teams, team.id, name)
    return result.ok ? null : result.message
  }

  function rename(name: string) {
    const result = renameTeam(team.id, name)
    if (result.ok) {
      show('view', 'rename')
      onRenamed(name.trim())
    }
    return result
  }

  function confirmDelete() {
    const result = deleteTeam(team.id)
    if (result.ok) onDeleted(team.name)
    else setDeleteError(result.message)
  }

  if (mode === 'rename') {
    return (
      <li className="team-row">
        <TeamNameForm
          label={`New name for '${team.name}'`}
          submitLabel="Save"
          initialName={team.name}
          check={checkRename}
          submit={rename}
          onCancel={() => show('view', 'rename')}
          focusOnMount
        />
      </li>
    )
  }

  return (
    <li className="team-row">
      <div className="team-row-summary">
        <Link to={`/teams/${team.id}`} className="team-row-name">
          {team.name}
        </Link>
        <span>
          {team.members.length}/{MAX_TEAM_SIZE} Pokémon
        </span>
      </div>

      {mode === 'view' ? (
        <div className="team-row-actions">
          {/* aria-label names the team, so a screen reader doesn't hear a list of identical "Rename" buttons */}
          <button
            ref={renameButton}
            type="button"
            aria-label={`Rename ${team.name}`}
            onClick={() => show('rename', null)}
          >
            Rename
          </button>
          <button
            ref={deleteButton}
            type="button"
            aria-label={`Delete ${team.name}`}
            onClick={() => show('confirm-delete', 'cancel-delete')}
          >
            Delete
          </button>
        </div>
      ) : (
        // Step 2 of deleting (decision D18): nothing is deleted until "Yes, delete" is pressed
        <div className="team-row-confirm">
          <p>Delete '{team.name}'? This can't be undone.</p>
          <div className="team-row-actions">
            <button type="button" onClick={confirmDelete}>
              Yes, delete
            </button>
            <button ref={cancelDeleteButton} type="button" onClick={() => show('view', 'delete')}>
              Cancel
            </button>
          </div>
          {deleteError !== null && <p className="field-error">{deleteError}</p>}
        </div>
      )}
    </li>
  )
}
