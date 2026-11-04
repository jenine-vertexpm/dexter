import { Link } from 'react-router'
import { formatPokemonNumber } from '../domain/format.ts'
import { MAX_NICKNAME_LENGTH, type TeamMember, type TeamsResult } from '../domain/team.ts'
import { useTeamMember } from '../queries/pokeApiQueries.ts'
import { ErrorMessage } from './ErrorMessage.tsx'
import { TextFieldForm } from './TextFieldForm.tsx'

export const MEMBER_ARTWORK_SIZE = 96

const NICKNAME_HINT = `Up to ${MAX_NICKNAME_LENGTH} letters, numbers or spaces. Leave it empty to remove the nickname.`

// One Pokémon in a team (M3 plan T6). The team stores only the species and nickname (D10);
// artwork, number and types load from PokéAPI, separately for each member, so one slow or
// failed member never holds up the others.
//
// The page owns the changes (remove, move, nickname) and passes them in, so it can move focus
// and announce what happened.
export function TeamMemberCard({
  member,
  position,
  teamSize,
  disabled,
  moveButtonRef,
  onMove,
  onRemove,
  checkNickname,
  saveNickname,
}: {
  member: TeamMember
  position: number // 0 for the first member
  teamSize: number
  // True while saved teams wait for a recovery choice (T5): every change control is disabled
  disabled: boolean
  // Lets the page find the Move buttons, to put focus back after a move
  moveButtonRef: (direction: 'up' | 'down', button: HTMLButtonElement | null) => void
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
  checkNickname: (text: string) => string | null
  saveNickname: (text: string) => TeamsResult
}) {
  const { species, nickname } = member
  const data = useTeamMember(species)

  return (
    <li className="team-member">
      <div className="team-member-info">
        {data.status === 'ready' && data.summary.artworkUrl ? (
          // width/height reserve the space, so nothing jumps while the image loads
          <img
            className="team-member-artwork"
            src={data.summary.artworkUrl}
            alt=""
            width={MEMBER_ARTWORK_SIZE}
            height={MEMBER_ARTWORK_SIZE}
            loading="lazy"
          />
        ) : (
          // The same size as the artwork, while loading, or when there's none
          <div className="team-member-artwork team-member-artwork-empty" aria-hidden="true">
            {data.status === 'ready' ? 'No artwork' : ''}
          </div>
        )}

        <div className="team-member-text">
          <h3 className="team-member-name">
            <Link to={`/pokemon/${species}`}>{species}</Link>
          </h3>
          {nickname !== null && (
            <p>
              Nickname: <strong>{nickname}</strong>
            </p>
          )}

          {data.status === 'loading' && <p role="status">Loading…</p>}
          {data.status === 'not-found' && <p>This Pokémon could not be found.</p>}
          {data.status === 'error' && <ErrorMessage error={data.error} onRetry={data.retry} what={species} />}
          {data.status === 'ready' && (
            <>
              <p className="team-member-number">{formatPokemonNumber(data.summary.id)}</p>
              {/* Types as text, never colour alone (brief §3.1) */}
              <ul className="team-member-types" aria-label="Types">
                {data.summary.types.map((type) => (
                  <li key={type}>{type}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* The visible text is short; aria-label names the Pokémon, so a screen reader doesn't
          hear six identical "Move up" buttons */}
      <div className="team-member-actions">
        <button
          ref={(button) => moveButtonRef('up', button)}
          type="button"
          aria-label={`Move ${species} up`}
          disabled={disabled || position === 0}
          onClick={() => onMove('up')}
        >
          Move up
        </button>
        <button
          ref={(button) => moveButtonRef('down', button)}
          type="button"
          aria-label={`Move ${species} down`}
          disabled={disabled || position === teamSize - 1}
          onClick={() => onMove('down')}
        >
          Move down
        </button>
        <button type="button" aria-label={`Remove ${species}`} disabled={disabled} onClick={onRemove}>
          Remove
        </button>
      </div>

      <TextFieldForm
        label={`Nickname for ${species}`}
        hint={NICKNAME_HINT}
        submitLabel={
          <>
            {/* The space sits outside the hidden text, so every browser keeps it in the name */}
            Save <span className="visually-hidden">nickname for {species}</span>
          </>
        }
        initialValue={nickname ?? ''}
        check={checkNickname}
        submit={saveNickname}
        disabled={disabled}
      />
    </li>
  )
}
