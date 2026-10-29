import { queryOptions, useQuery } from '@tanstack/react-query'
import {
  ApiError,
  getEvolutionChain,
  getPokemon,
  getPokemonById,
  getSpecies,
  getSpeciesIndex,
  getType,
} from '../api/client.ts'
import { belongsToSpecies, defaultVarietyName, toPokemonSummary } from '../domain/pokemon.ts'
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

export function usePokemon(name: string) {
  return useQuery(pokemonQuery(name))
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
