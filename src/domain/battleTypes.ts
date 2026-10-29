// The 18 types that exist in battle, in PokéAPI's id order (type/1 to type/18).
// PokéAPI's /type also lists "stellar", "unknown" and "shadow", which are never shown.
export const BATTLE_TYPES = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
] as const

export type BattleType = (typeof BATTLE_TYPES)[number]

export function isBattleType(name: string): name is BattleType {
  return (BATTLE_TYPES as readonly string[]).includes(name)
}
