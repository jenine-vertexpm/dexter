import { useId } from 'react'
import { formatStatName } from '../domain/format.ts'
import type { PokemonDetail } from '../domain/pokemon.ts'

// The highest base stat any Pokémon has (Blissey's HP). Every bar is drawn out of this, so bars
// can be compared between Pokémon.
export const MAX_BASE_STAT = 255

// One row per stat: its name, its number, and a bar. The number is always shown as text, so the
// bar is never the only way to read it (brief §3.1). The bar is also a "meter" for screen readers:
// it is named after the stat and announces its value out of 255.
export function StatBars({ stats }: { stats: PokemonDetail['stats'] }) {
  // A unique prefix for this component's ids, so each bar can point at its label
  const idPrefix = useId()

  return (
    <ul className="stat-bars">
      {stats.map((stat) => {
        const labelId = `${idPrefix}-${stat.name}`
        const percent = Math.min(stat.value / MAX_BASE_STAT, 1) * 100
        return (
          <li key={stat.name} className="stat-row">
            <span id={labelId} className="stat-name">
              {formatStatName(stat.name)}
            </span>
            <span className="stat-value">{stat.value}</span>
            <div
              role="meter"
              aria-labelledby={labelId}
              aria-valuemin={0}
              aria-valuemax={MAX_BASE_STAT}
              aria-valuenow={stat.value}
              className="stat-bar"
            >
              <div className="stat-bar-fill" style={{ width: `${percent}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
