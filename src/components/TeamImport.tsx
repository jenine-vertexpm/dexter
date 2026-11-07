import { useId, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { FILE_TOO_BIG_MESSAGE, MAX_TEAM_FILE_BYTES, parseTeamFile } from '../domain/teamFile.ts'
import { useSpeciesIndex } from '../queries/pokeApiQueries.ts'
import { useTeams } from '../teams/useTeams.ts'
import { ErrorMessage } from './ErrorMessage.tsx'
import './TeamImport.css'

type Outcome =
  | { kind: 'rejected'; fileName: string; messages: string[] }
  | { kind: 'imported'; id: string; name: string }

// Import a team from a file made by Export (M3 plan T10, §4.2). The file is untrusted:
// 1. its size is checked before it is read (a huge file is never loaded into memory)
// 2. its text is checked by parseTeamFile: JSON, format and version, the same rules as the
//    forms, every species in PokéAPI's species index, and no clash with an existing name
// 3. only then is it added, as a new team with a new id. Existing teams are never changed.
// Any failure lists every problem as plain text, and nothing changes.
export function TeamImport({ onImported }: { onImported: (name: string) => void }) {
  const { teams, importTeam, savingPaused } = useTeams()
  // The species index says which species exist (check 5). It is the same cached request the
  // Pokémon list uses.
  const speciesIndex = useSpeciesIndex()
  const knownSpecies = useMemo(
    () => new Set(speciesIndex.data?.results.map((result) => result.name)),
    [speciesIndex.data],
  )
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const id = useId()
  const hintId = `${id}-hint`

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Cleared straight away, so choosing the same file again still counts as a change
    input.value = ''
    if (file === undefined) return
    const reject = (messages: string[]) => setOutcome({ kind: 'rejected', fileName: file.name, messages })

    // Check 1, before reading
    if (file.size > MAX_TEAM_FILE_BYTES) {
      reject([FILE_TOO_BIG_MESSAGE])
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      reject(["Couldn't read this file."])
      return
    }

    const parsed = parseTeamFile(text, knownSpecies, teams)
    if (!parsed.ok) {
      reject(parsed.messages)
      return
    }
    // The team state checks the name and members once more, against the very latest teams
    const added = importTeam(parsed.team)
    if (!added.ok) {
      reject([added.message])
      return
    }
    // A new team is always added at the end of the list
    const team = added.value[added.value.length - 1]
    setOutcome({ kind: 'imported', id: team.id, name: team.name })
    onImported(team.name)
  }

  return (
    <section className="team-import">
      <h2>Import a team</h2>
      {speciesIndex.isError ? (
        // Without the species index, species can't be checked, so importing waits for it
        <ErrorMessage
          error={speciesIndex.error}
          onRetry={() => void speciesIndex.refetch()}
          what="the list of Pokémon species"
        />
      ) : (
        <>
          <label htmlFor={id}>Team file</label>
          <p id={hintId} className="field-hint">
            {speciesIndex.data
              ? 'A .json file exported from Dexter, up to 16 KB. It is added as a new team.'
              : 'Loading the list of Pokémon species…'}
          </p>
          <input
            id={id}
            type="file"
            accept=".json,application/json"
            aria-describedby={hintId}
            // Waits for the species index; and, like every change, waits while saving is paused (T5)
            disabled={savingPaused || !speciesIndex.data}
            onChange={(event) => void handleFile(event)}
          />
        </>
      )}

      {outcome?.kind === 'rejected' && (
        // role="alert": screen readers read the problems out as soon as they appear.
        // Everything here, the file name included, is shown as plain text.
        <div role="alert" className="import-error">
          <p>Couldn't import {outcome.fileName}. Nothing was changed.</p>
          <ul>
            {outcome.messages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {outcome?.kind === 'imported' && (
        <p className="import-success">
          Imported '{outcome.name}'. <Link to={`/teams/${outcome.id}`}>Open {outcome.name}</Link>
        </p>
      )}
    </section>
  )
}
