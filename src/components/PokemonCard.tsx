import { Link } from 'react-router'
import { formatPokemonNumber } from '../domain/format.ts'
import type { SpeciesEntry } from '../domain/speciesList.ts'
import { usePokemonSummary } from '../queries/pokeApiQueries.ts'
import { ErrorMessage } from './ErrorMessage.tsx'

export const ARTWORK_SIZE = 120

// One Pokémon in the list. Number and name are known from the species list straight away;
// the artwork and types load separately for each card.
export function PokemonCard({ entry }: { entry: SpeciesEntry }) {
  const { data, error, isPending, refetch } = usePokemonSummary(entry)

  return (
    <article className="pokemon-card" aria-label={entry.name}>
      <Link to={`/pokemon/${entry.name}`} className="pokemon-card-link">
        {data?.artworkUrl ? (
          // width/height reserve the space, so the page does not jump while the image loads
          <img src={data.artworkUrl} alt="" width={ARTWORK_SIZE} height={ARTWORK_SIZE} loading="lazy" />
        ) : (
          <div className="artwork-placeholder" aria-hidden="true">
            {data ? 'No artwork' : ''}
          </div>
        )}
        <span className="pokemon-number">{formatPokemonNumber(entry.id)}</span>
        <span className="pokemon-name">{entry.name}</span>
      </Link>

      {isPending && (
        <p role="status" className="card-status">
          Loading…
        </p>
      )}
      {error && <ErrorMessage error={error} onRetry={() => void refetch()} what={entry.name} />}
      {data && (
        // Types as text, never colour alone (brief §3.1)
        <ul className="type-list" aria-label="Types">
          {data.types.map((type) => (
            <li key={type}>{type}</li>
          ))}
        </ul>
      )}
    </article>
  )
}
