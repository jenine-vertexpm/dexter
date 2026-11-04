import { useMemo } from 'react'
import { Link } from 'react-router'
import { formatPokemonNumber } from '../domain/format.ts'
import { neighbours, toSpeciesEntries } from '../domain/speciesList.ts'
import { useSpeciesIndex } from '../queries/pokeApiQueries.ts'
import { ErrorMessage } from './ErrorMessage.tsx'

// Links to the species before and after this one by number, e.g. arbok ← pikachu → raichu.
// Names come from the species index (the same cached list the list page uses), so alternate
// forms never appear. No "previous" link on the first species, no "next" link on the last.
export function SpeciesNav({ id }: { id: number }) {
  const index = useSpeciesIndex()
  const entries = useMemo(() => (index.data ? toSpeciesEntries(index.data) : []), [index.data])

  if (index.isError) {
    return (
      <ErrorMessage
        error={index.error}
        onRetry={() => void index.refetch()}
        what="the previous and next Pokémon"
      />
    )
  }
  // Still loading: show nothing yet. The rest of the page is already usable.
  if (!index.data) return null

  const { previous, next } = neighbours(entries, id)
  return (
    <nav aria-label="Previous and next Pokémon" className="species-nav">
      {previous && (
        <Link to={`/pokemon/${previous.name}`}>
          <span aria-hidden="true">← </span>Previous: {formatPokemonNumber(previous.id)} {previous.name}
        </Link>
      )}
      {next && (
        <Link to={`/pokemon/${next.name}`} className="species-nav-next">
          Next: {formatPokemonNumber(next.id)} {next.name}
          <span aria-hidden="true"> →</span>
        </Link>
      )}
    </nav>
  )
}
