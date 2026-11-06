import type { ApiType } from '../api/schemas.ts'
import { analyzeTeam, SHARED_WEAKNESS_MIN } from '../domain/teamAnalysis.ts'
import { useTeamPokemon, useTypes } from '../queries/pokeApiQueries.ts'
import { ErrorMessage } from './ErrorMessage.tsx'
import { StatBars } from './StatBars.tsx'
import './TeamAnalysis.css'

// The team page's analysis (M3 plan T8, decision D15): for each of the 18 attacking types, how
// many members are weak to it, resist it or are immune to it, plus the team's average base stats.
// It has its own loading and error + retry, so a problem here never hides the rest of the page.
// It belongs on the team page: the member cards there load each member, and this section reads
// the same cached results (see useTeamPokemon). It loads the members' types itself.
export function TeamAnalysis({ species }: { species: readonly string[] }) {
  // Step 1: every member's types and stats
  const team = useTeamPokemon(species)
  // Step 2: the damage relations of every type in the team, each type once (union)
  const typeNames = team.status === 'ready' ? [...new Set(team.members.flatMap((member) => member.types))] : []
  const typeResults = useTypes(typeNames)

  return (
    <section aria-labelledby="analysis-heading" className="team-analysis">
      <h2 id="analysis-heading">Team analysis</h2>
      {species.length === 0 ? (
        <p>Add Pokémon to see the analysis.</p>
      ) : team.status === 'error' ? (
        <ErrorMessage error={team.error} onRetry={team.retry} what="the team analysis" />
      ) : typeResults.some((result) => result.isError) ? (
        <ErrorMessage
          error={typeResults.find((result) => result.isError)?.error}
          // Only the types that failed are asked for again; loaded ones stay cached
          onRetry={() => typeResults.forEach((result) => result.isError && void result.refetch())}
          what="the team analysis"
        />
      ) : team.status === 'loading' || typeResults.some((result) => !result.data) ? (
        <p role="status">Loading the team analysis…</p>
      ) : (
        <AnalysisResult members={team.members} types={typeResults.flatMap((result) => (result.data ? [result.data] : []))} />
      )}
    </section>
  )
}

// Shown once everything has loaded
function AnalysisResult({
  members,
  types,
}: {
  members: { types: string[]; stats: { name: string; value: number }[] }[]
  types: ApiType[]
}) {
  // Each member's type names swapped for the loaded types, which carry the damage relations
  const typeByName = new Map(types.map((type) => [type.name, type]))
  const analysis = analyzeTeam(
    members.map((member) => ({
      types: member.types.flatMap((name) => typeByName.get(name) ?? []),
      stats: member.stats,
    })),
  )

  return (
    <>
      <p>
        A type is marked as a shared weakness when {SHARED_WEAKNESS_MIN} or more members are weak to it and no
        member resists it or is immune to it.
      </p>
      <table className="analysis-table">
        <caption>How many members are weak to, resist or are immune to each attacking type</caption>
        <thead>
          <tr>
            <th scope="col">Attacking type</th>
            <th scope="col">Weak</th>
            <th scope="col">Resist</th>
            <th scope="col">Immune</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {analysis.coverage.map((row) => (
            // The class only adds a colour; the Note column says it in words (brief §3.1)
            <tr key={row.attackingType} className={row.highlighted ? 'analysis-shared-weakness' : undefined}>
              <th scope="row" className="analysis-type">
                {row.attackingType}
              </th>
              <td>{row.weak}</td>
              <td>{row.resist}</td>
              <td>{row.immune}</td>
              <td>
                {row.highlighted && (
                  <>
                    {/* The symbol is decoration; screen readers just hear "Shared weakness" */}
                    <span aria-hidden="true">⚠ </span>Shared weakness
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Another h2, not h3: on this page h3s are the member names */}
      <h2>Average base stats</h2>
      <StatBars stats={analysis.averageStats} decimals={1} />
    </>
  )
}
