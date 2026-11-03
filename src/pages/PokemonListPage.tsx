//import React’s useMemo, URL tools, shared components, list-state helpers, list-processing logic, the species-index query, and the page’s CSS.
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorMessage } from '../components/ErrorMessage.tsx'
import { Pagination } from '../components/Pagination.tsx'
import { PokemonCard } from '../components/PokemonCard.tsx'
import { parseListParams, toListParams, type ListState } from '../domain/listParams.ts'
import { queryList, toSpeciesEntries } from '../domain/speciesList.ts'
import { useSpeciesIndex } from '../queries/pokeApiQueries.ts'
import './PokemonListPage.css'
const linkToState = (state: ListState) => ({ search: toListParams(state).toString() })

export function PokemonListPage() {
  // read the URL’s query parameters, convert them to a safe list state, and request the species index. The URL is intended to be the source of truth for page, search, and filters.
  const [searchParams] = useSearchParams()
  const state = parseListParams(searchParams)
  const index = useSpeciesIndex()

  // turn the API’s index into entries with IDs and names. useMemo avoids repeating that conversion unless the index data changes.
  const entries = useMemo(() => (index.data ? toSpeciesEntries(index.data) : []), [index.data])
  // 
  const result = queryList(entries, { search: '', typeFilters: [], page: state.page })

  return (
    <>
      <h1>Pokémon</h1>
      {index.isPending && <p role="status">Loading Pokémon…</p>}
      {index.isError && (
        <ErrorMessage error={index.error} onRetry={() => void index.refetch()} what="the Pokémon list" />
      )}
      {index.isSuccess && result.total === 0 && <p>No Pokémon found.</p>}
      {index.isSuccess && result.total > 0 && result.items.length === 0 && (
        <p>
          Page {state.page} does not exist. There {result.totalPages === 1 ? 'is' : 'are'} only {result.totalPages}{' '}
          {result.totalPages === 1 ? 'page' : 'pages'}. <Link to={linkToState({ ...state, page: 1 })}>Go to page 1</Link>
        </p>
      )}
      {result.items.length > 0 && (
        <>
          <ul className="pokemon-grid">
            {result.items.map((entry) => (
              <li key={entry.id}>
                <PokemonCard entry={entry} />
              </li>
            ))}
          </ul>
          <Pagination
            page={state.page}
            totalPages={result.totalPages}
            linkTo={(page) => linkToState({ ...state, page })}
          />
        </>
      )}
    </>
  )
}
