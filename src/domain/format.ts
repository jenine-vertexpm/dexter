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

// "#0025" for Pikachu: four digits, because the highest species number (1025) has four
export function formatPokemonNumber(id: number): string {
  return `#${String(id).padStart(4, '0')}`
}
