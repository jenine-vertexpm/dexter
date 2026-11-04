import { formatMultiplier } from '../domain/format.ts'
import { getMatchups, type Multiplier } from '../domain/matchups.ts'
import { useTypes } from '../queries/pokeApiQueries.ts'
import { ErrorMessage } from './ErrorMessage.tsx'

// A class per multiplier, for an optional background colour. The text always says the value.
const MULTIPLIER_CLASS: Record<Multiplier, string> = {
  0: 'matchup-immune',
  0.25: 'matchup-resist',
  0.5: 'matchup-resist',
  1: 'matchup-neutral',
  2: 'matchup-weak',
  4: 'matchup-weak',
}

// The detail page's type matchups: how much damage each of the 18 attacking types does to this
// Pokémon. Loads the Pokémon's 1–2 types (shared with the list's type filter cache) and runs the
// S3 calculation. Its own loading and error + retry, so the rest of the page always shows (plan S11).
export function TypeMatchups({ types }: { types: readonly string[] }) {
  const results = useTypes(types)
  const failed = results.filter((result) => result.isError)
  const loaded = results.flatMap((result) => (result.data ? [result.data] : []))

  return (
    <section aria-labelledby="matchups-heading" className="matchups">
      <h2 id="matchups-heading">Type matchups</h2>
      {failed.length > 0 ? (
        <ErrorMessage
          error={failed[0]?.error}
          // Only the types that failed are asked for again; loaded ones stay cached
          onRetry={() => failed.forEach((result) => void result.refetch())}
          what="the type matchups"
        />
      ) : loaded.length < types.length ? (
        <p role="status">Loading type matchups…</p>
      ) : (
        <table className="matchup-table">
          <caption>Damage this Pokémon takes from each attacking type</caption>
          <thead>
            <tr>
              <th scope="col">Attacking type</th>
              <th scope="col">Damage</th>
            </tr>
          </thead>
          <tbody>
            {getMatchups(loaded).map(({ attackingType, multiplier }) => (
              <tr key={attackingType}>
                <th scope="row" className="matchup-type">
                  {attackingType}
                </th>
                <td className={MULTIPLIER_CLASS[multiplier]}>{formatMultiplier(multiplier)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
