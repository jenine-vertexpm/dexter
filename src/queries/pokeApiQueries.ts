import { queryOptions, useQueries, useQuery } from '@tanstack/react-query'
import {
  ApiError,
  getEvolutionChain,
  getPokemon,
  getPokemonById,
  getSpecies,
  getSpeciesIndex,
  getType,
} from '../api/client.ts'
import {
  belongsToSpecies,
  defaultVarietyName,
  toPokemonSummary,
  type PokemonSummary,
} from '../domain/pokemon.ts'
import type { SpeciesEntry } from '../domain/speciesList.ts'

// One query per PokéAPI endpoint. Each has a key (its address in TanStack Query's cache) and a
// function that loads it. TanStack Query passes a `signal` that it aborts when the result is no
// longer needed (the page was left, or the key changed), and we hand it to the API client so the
// request is really cancelled.
//
// Keys follow one pattern: ['pokeapi', <resource>, <id or lower-case name>]. Names are lower-cased
// so "Eevee" and "eevee" share one cache entry.

export const speciesIndexQuery = () =>
  queryOptions({
    queryKey: ['pokeapi', 'species-index'],
    queryFn: ({ signal }) => getSpeciesIndex(signal),
  })

export const speciesQuery = (name: string) =>
  queryOptions({
    queryKey: ['pokeapi', 'species', name.toLowerCase()],
    queryFn: ({ signal }) => getSpecies(name, signal),
  })

export const pokemonQuery = (name: string) =>
  queryOptions({
    queryKey: ['pokeapi', 'pokemon', name.toLowerCase()],
    queryFn: ({ signal }) => getPokemon(name, signal),
  })

export const pokemonByIdQuery = (id: number) =>
  queryOptions({
    queryKey: ['pokeapi', 'pokemon-by-id', id],
    queryFn: ({ signal }) => getPokemonById(id, signal),
  })

export const evolutionChainQuery = (id: number) =>
  queryOptions({
    queryKey: ['pokeapi', 'evolution-chain', id],
    queryFn: ({ signal }) => getEvolutionChain(id, signal),
  })

export const typeQuery = (name: string) =>
  queryOptions({
    queryKey: ['pokeapi', 'type', name.toLowerCase()],
    queryFn: ({ signal }) => getType(name, signal),
  })

// What a list card shows for one species. Combines endpoints, so it is one query with one
// loading/error/retry state for the card:
// 1. Load Pokémon N for species N (1 request; relies on "species id = default Pokémon id", plan §5 A1).
// 2. Check it really belongs to the species. If not, take the documented route instead:
//    the species, its default variety, then that Pokémon (2 more requests).
export const pokemonSummaryQuery = (entry: SpeciesEntry) =>
  queryOptions({
    queryKey: ['pokeapi', 'pokemon-summary', entry.id],
    queryFn: async ({ signal }) => {
      const pokemon = await getPokemonById(entry.id, signal)
      if (belongsToSpecies(pokemon, entry.name)) return toPokemonSummary(pokemon, entry.id)

      const species = await getSpecies(entry.name, signal)
      const varietyName = defaultVarietyName(species)
      if (varietyName === null) {
        throw new ApiError('invalid-response', `Species "${entry.name}" has no default Pokémon`)
      }
      return toPokemonSummary(await getPokemon(varietyName, signal), entry.id)
    },
  })

// Hooks for components. Each returns TanStack Query's result: `data`, `error`, `isPending`,
// `refetch` (for a retry button) and more.

export function useSpeciesIndex() {
  return useQuery(speciesIndexQuery())
}

export function useSpecies(name: string) {
  return useQuery(speciesQuery(name))
}

// Waits while name is null: the detail page only knows which Pokémon to load once its species has
// loaded (species "deoxys" → Pokémon "deoxys-normal")
export function usePokemon(name: string | null) {
  return useQuery({ ...pokemonQuery(name ?? ''), enabled: name !== null })
}

export function usePokemonById(id: number) {
  return useQuery(pokemonByIdQuery(id))
}

export function usePokemonSummary(entry: SpeciesEntry) {
  return useQuery(pokemonSummaryQuery(entry))
}

// Waits while id is null: the species is still loading, or has no evolution chain
export function useEvolutionChain(id: number | null) {
  return useQuery({ ...evolutionChainQuery(id ?? 0), enabled: id !== null })
}

export function useType(name: string) {
  return useQuery(typeQuery(name))
}

// Several types at once, one result per name in the same order: the list's type filter (0–2
// types), and a Pokémon's own 1–2 types for its matchups. Shares the cache with useType.
export function useTypes(names: readonly string[]) {
  return useQueries({ queries: names.map((name) => typeQuery(name)) })
}

// What a team member card needs to know about one species (M3 plan T6)
export type TeamMemberData =
  | { status: 'loading' }
  // PokéAPI has no species by this name (e.g. it was edited by hand in storage)
  | { status: 'not-found' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; summary: PokemonSummary }

// One team member's artwork, number and types. Teams only store the species name (decision D10),
// so this loads the rest the same way the detail page does: the species, then its default
// Pokémon (species "deoxys" → Pokémon "deoxys-normal"). Same queries, so the same cache: opening
// a member's detail page afterwards needs no new requests, and the other way round.
export function useTeamMember(speciesName: string): TeamMemberData {
  const species = useSpecies(speciesName)
  const varietyName = species.data ? defaultVarietyName(species.data) : null
  const pokemon = usePokemon(varietyName)

  if (species.error instanceof ApiError && species.error.kind === 'not-found') {
    return { status: 'not-found' }
  }
  if (species.isError) {
    return { status: 'error', error: species.error, retry: () => void species.refetch() }
  }
  if (species.data && varietyName === null) {
    // PokéAPI says every species has a default Pokémon; this only happens if that ever stops being true
    const error = new ApiError('invalid-response', `Species "${speciesName}" has no default Pokémon`)
    return { status: 'error', error, retry: () => void species.refetch() }
  }
  if (pokemon.isError) {
    return { status: 'error', error: pokemon.error, retry: () => void pokemon.refetch() }
  }
  if (species.data && pokemon.data) {
    return { status: 'ready', summary: toPokemonSummary(pokemon.data, species.data.id) }
  }
  return { status: 'loading' }
}
