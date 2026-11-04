import type { Multiplier } from './matchups.ts'

// PokéAPI names use hyphens: "run-away" → "run away". (Capital letters come from CSS.)
export function formatName(name: string): string {
  return name.replace(/-/g, ' ')
}

const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  'special-attack': 'Special Attack',
  'special-defense': 'Special Defense',
  speed: 'Speed',
}

// "special-attack" → "Special Attack". An unexpected stat name still gets a readable label.
export function formatStatName(name: string): string {
  return STAT_LABELS[name] ?? formatName(name)
}

const MULTIPLIER_LABELS: Record<Multiplier, string> = {
  0: '0×',
  0.25: '¼×',
  0.5: '½×',
  1: '1×',
  2: '2×',
  4: '4×',
}

// A damage multiplier as text, e.g. 0.25 → "¼×", so it never depends on colour (brief §3.1)
export function formatMultiplier(multiplier: Multiplier): string {
  return MULTIPLIER_LABELS[multiplier]
}

// "#0025" for Pikachu: four digits, because the highest species number (1025) has four
export function formatPokemonNumber(id: number): string {
  return `#${String(id).padStart(4, '0')}`
}
