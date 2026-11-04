//import React’s useMemo, URL tools, shared components, list-state helpers, list-processing logic, the species-index query, and the page’s CSS.
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorMessage } from '../components/ErrorMessage.tsx'
import { Pagination } from '../components/Pagination.tsx'
import { PokemonCard } from '../components/PokemonCard.tsx'
import { TypeFilter } from '../components/TypeFilter.tsx'
import type { BattleType } from '../domain/battleTypes.ts'
import { MAX_SEARCH_LENGTH, parseListParams, toListParams, type ListState } from '../domain/listParams.ts'
import { queryList, speciesIdsWithType, toSpeciesEntries } from '../domain/speciesList.ts'
import { useSpeciesIndex, useTypes } from '../queries/pokeApiQueries.ts'
import './PokemonListPage.css'
const linkToState = (state: ListState) => ({ search: toListParams(state).toString() })

// The "nothing matches" message names the search and the types in use
function noMatchMessage(search: string, types: readonly BattleType[]): string {
  const typeText = types.length === 0 ? '' : `the ${types.length === 1 ? 'type' : 'types'} ${types.join(' and ')}`
  if (search === '' && typeText === '') return 'No Pokémon found.'
  if (typeText === '') return `No Pokémon match '${search}'`
  if (search === '') return `No Pokémon have ${typeText}.`
  return `No Pokémon match '${search}' with ${typeText}.`
}

export function PokemonListPage() {
  // read the URL’s query parameters, convert them to a safe list state, and request the species index. The URL is intended to be the source of truth for page, search, and filters.
  const [searchParams, setSearchParams] = useSearchParams()
  const state = parseListParams(searchParams)
  const index = useSpeciesIndex()

  // Each keystroke writes the search to `q` and goes back to page 1, keeping other settings.
  // The first letter of a new search adds one history entry; later letters replace it, so Back
  // returns to where you were before searching, not to the previous letter (plan S7, D6).
  function changeSearch(search: string) {
    setSearchParams(toListParams({ ...state, search, page: 1 }), { replace: state.search !== '' })
  }
  const searchText = state.search.trim()

  // Ticking or unticking a type adds a history entry, so Back undoes it, and goes back to page 1 (D6)
  function changeTypes(types: BattleType[]) {
    setSearchParams(toListParams({ ...state, types, page: 1 }))
  }

  // turn the API’s index into entries with IDs and names. useMemo avoids repeating that conversion unless the index data changes.
  const entries = useMemo(() => (index.data ? toSpeciesEntries(index.data) : []), [index.data])

  // One request per chosen type, cached like everything else. Each type becomes the set of species
  // that have it. The list is only shown once every chosen type has loaded, so it never shows
  // Pokémon that the filter would remove.
  const typeResults = useTypes(state.types)
  const typeData = typeResults.flatMap((type) => (type.data ? [type.data] : []))
  const listReady = index.isSuccess && typeData.length === state.types.length
  const speciesIds = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries])
  const typeFilters = typeData.map((type) => speciesIdsWithType(type, speciesIds))
  // 
  const result = queryList(listReady ? entries : [], { search: state.search, typeFilters, page: state.page })

  return (
    <>
      <h1>Pokémon</h1>
      {/* The box shows the URL's `q`, so the URL stays the one place the search lives */}
      <div className="search">
        <label htmlFor="pokemon-search">Search Pokémon by name</label>
        <input
          id="pokemon-search"
          type="search"
          autoComplete="off"
          maxLength={MAX_SEARCH_LENGTH}
          value={state.search}
          onChange={(event) => changeSearch(event.target.value)}
        />
      </div>
      <TypeFilter selected={state.types} onChange={changeTypes} />
      {index.isPending && <p role="status">Loading Pokémon…</p>}
      {index.isError && (
        <ErrorMessage error={index.error} onRetry={() => void index.refetch()} what="the Pokémon list" />
      )}
      {typeResults.some((type) => type.isPending) && <p role="status">Loading types…</p>}
      {typeResults.map((type, i) =>
        type.isError ? (
          <ErrorMessage
            key={state.types[i]}
            error={type.error}
            onRetry={() => void type.refetch()}
            what={`the ${state.types[i]} type`}
          />
        ) : null,
      )}
      {/* React shows the search as plain text, so typed markup is never treated as HTML */}
      {listReady && result.total === 0 && <p>{noMatchMessage(searchText, state.types)}</p>}
      {listReady && result.total > 0 && result.items.length === 0 && (
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
