import type { ApiType } from '../api/schemas.ts'
import { BATTLE_TYPES, type BattleType } from './battleTypes.ts'

export type Multiplier = 0 | 0.25 | 0.5 | 1 | 2 | 4

export interface Matchup {
  attackingType: BattleType
  multiplier: Multiplier
}

// How much damage each attacking type does to a Pokémon with these 1–2 types.
// For a dual type the two effects multiply: 2 × 2 = 4, ½ × ½ = ¼, and any 0 (immunity) wins.
// Uses current damage relations only; abilities (e.g. Levitate) are not taken into account.
export function getMatchups(defendingTypes: readonly ApiType[]): Matchup[] {
  if (defendingTypes.length < 1 || defendingTypes.length > 2) {
    throw new RangeError(`A Pokémon has 1 or 2 types, got ${defendingTypes.length}`)
  }
  return BATTLE_TYPES.map((attackingType) => {
    let multiplier = 1
    for (const type of defendingTypes) {
      multiplier *= damageFactor(type, attackingType)
    }
    // With at most two factors from {0, ½, 1, 2} the product is always one of the Multiplier values
    return { attackingType, multiplier: multiplier as Multiplier }
  })
}

function damageFactor(defendingType: ApiType, attackingType: BattleType): number {
  const relations = defendingType.damage_relations
  const has = (list: readonly { name: string }[]) => list.some((type) => type.name === attackingType)
  if (has(relations.no_damage_from)) return 0
  if (has(relations.half_damage_from)) return 0.5
  if (has(relations.double_damage_from)) return 2
  return 1
}
