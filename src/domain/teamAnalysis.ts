import type { ApiType } from '../api/schemas.ts'
import type { BattleType } from './battleTypes.ts'
import { getMatchups } from './matchups.ts'

// What the analysis needs to know about one team member
export interface AnalysisMember {
  types: readonly ApiType[] // its 1–2 types, with their damage relations
  stats: readonly { name: string; value: number }[]
}

// How the team as a whole fares against one attacking type. Each member counts once:
// Scizor takes 4× from fire, and that is one weak member, not two.
export interface TypeCoverage {
  attackingType: BattleType
  weak: number // members taking 2× or 4×
  resist: number // members taking ½× or ¼×
  immune: number // members taking 0×
  highlighted: boolean // a shared weakness (decision D15)
}

export interface TeamAnalysis {
  coverage: TypeCoverage[] // all 18 battle types, in the usual order
  averageStats: { name: string; value: number }[] // rounded to 1 decimal
}

// At least this many weak members, and nobody covering, makes a shared weakness
export const SHARED_WEAKNESS_MIN = 3

// The team analysis (M3 plan T8, decision D15). The damage numbers come from getMatchups, the
// same calculation as the detail page, so the two always agree.
export function analyzeTeam(members: readonly AnalysisMember[]): TeamAnalysis {
  if (members.length === 0) {
    throw new RangeError('An empty team has no analysis')
  }
  return { coverage: countCoverage(members), averageStats: averageStats(members) }
}

function countCoverage(members: readonly AnalysisMember[]): TypeCoverage[] {
  // One row of 18 matchups per member
  const matchupsPerMember = members.map((member) => getMatchups(member.types))

  // getMatchups always lists the 18 types in the same order, so position i is the same type for everyone
  return matchupsPerMember[0].map(({ attackingType }, i) => {
    let weak = 0
    let resist = 0
    let immune = 0
    for (const matchups of matchupsPerMember) {
      const multiplier = matchups[i].multiplier
      if (multiplier === 0) immune += 1
      else if (multiplier < 1) resist += 1
      else if (multiplier > 1) weak += 1
      // 1× (neutral) counts nowhere
    }
    // An immune member protects the team as well as (better than) a resistant one (D15)
    const highlighted = weak >= SHARED_WEAKNESS_MIN && resist === 0 && immune === 0
    return { attackingType, weak, resist, immune, highlighted }
  })
}

// The mean of each base stat over the members, e.g. HP 55 and 50 → 52.5
function averageStats(members: readonly AnalysisMember[]): TeamAnalysis['averageStats'] {
  // Stat names in the order PokéAPI gives them (hp, attack, defense, ...)
  const names = [...new Set(members.flatMap((member) => member.stats.map((stat) => stat.name)))]
  return names.map((name) => {
    const values = members.flatMap((member) => member.stats.filter((stat) => stat.name === name).map((stat) => stat.value))
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    return { name, value: Math.round(mean * 10) / 10 }
  })
}
