import { queryOptions, useQuery } from '@tanstack/react-query'
import {
  getEvolutionChain,
  getPokemon,
  getPokemonById,
  getSpecies,
  getSpeciesIndex,
  getType,
} from '../api/client.ts'

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

// Waits while id is null: the species is still loading, or has no evolution chain
export function useEvolutionChain(id: number | null) {
  return useQuery({ ...evolutionChainQuery(id ?? 0), enabled: id !== null })
}

export function useType(name: string) {
  return useQuery(typeQuery(name))
}
