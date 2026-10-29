import type { ApiPokemon, ApiSpecies } from '../api/schemas.ts'
import { pickEnglishFlavorText } from './flavorText.ts'
import { idFromUrl } from './resourceId.ts'
import { decimetresToMetres, hectogramsToKilograms } from './units.ts'

// What a card in the list shows
export interface PokemonSummary {
  id: number // the species number, e.g. 386 for Deoxys
  name: string // the species name, e.g. "deoxys" (not "deoxys-normal")
  artworkUrl: string | null
  types: string[] // in the order the game lists them
}

// What the detail page shows
export interface PokemonDetail extends PokemonSummary {
  heightMetres: number
  weightKilograms: number
  stats: { name: string; value: number }[]
  abilities: { name: string; isHidden: boolean }[]
  description: string | null
  evolutionChainId: number | null
}

// Safeguard for the "species id = default Pokémon id" shortcut (plan §5, A1): the list loads
// Pokémon N for species N, then checks the Pokémon really belongs to that species.
export function belongsToSpecies(pokemon: ApiPokemon, speciesName: string): boolean {
  return pokemon.species.name === speciesName
}

// The Pokémon to show for a species, e.g. "deoxys-normal" for "deoxys". Null if none is marked default.
export function defaultVarietyName(species: ApiSpecies): string | null {
  return species.varieties.find((variety) => variety.is_default)?.pokemon.name ?? null
}

export function toPokemonSummary(pokemon: ApiPokemon, speciesId: number): PokemonSummary {
  return {
    id: speciesId,
    name: pokemon.species.name,
    artworkUrl: pokemon.sprites.other['official-artwork'].front_default,
    types: [...pokemon.types].sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name),
  }
}

export function toPokemonDetail(pokemon: ApiPokemon, species: ApiSpecies): PokemonDetail {
  return {
    ...toPokemonSummary(pokemon, species.id),
    heightMetres: decimetresToMetres(pokemon.height),
    weightKilograms: hectogramsToKilograms(pokemon.weight),
    stats: pokemon.stats.map((entry) => ({ name: entry.stat.name, value: entry.base_stat })),
    abilities: [...pokemon.abilities]
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => ({ name: entry.ability.name, isHidden: entry.is_hidden })),
    description: pickEnglishFlavorText(species.flavor_text_entries),
    evolutionChainId: species.evolution_chain ? idFromUrl(species.evolution_chain.url) : null,
  }
}
