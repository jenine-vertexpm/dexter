// "#0025" for Pikachu: four digits, because the highest species number (1025) has four
export function formatPokemonNumber(id: number): string {
  return `#${String(id).padStart(4, '0')}`
}
