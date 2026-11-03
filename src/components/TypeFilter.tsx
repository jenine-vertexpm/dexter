import { BATTLE_TYPES, type BattleType } from '../domain/battleTypes.ts'
import { MAX_TYPES } from '../domain/listParams.ts'

interface TypeFilterProps {
  selected: readonly BattleType[]
  onChange: (types: BattleType[]) => void
}

// One checkbox per battle type. At most two can be ticked: once two are, the others are
// switched off and the hint says why. aria-live makes screen readers read the hint when it changes.
export function TypeFilter({ selected, onChange }: TypeFilterProps) {
  const full = selected.length >= MAX_TYPES

  function toggle(type: BattleType) {
    onChange(selected.includes(type) ? selected.filter((t) => t !== type) : [...selected, type])
  }

  return (
    <fieldset className="type-filter" aria-describedby="type-filter-hint">
      <legend>Filter by type</legend>
      <p id="type-filter-hint" className="type-filter-hint" aria-live="polite">
        {full
          ? 'You have chosen 2 types, the most allowed. Untick one to choose a different type.'
          : 'Choose up to 2 types. With 2, only Pokémon that have both are shown.'}
      </p>
      <div className="type-filter-options">
        {BATTLE_TYPES.map((type) => {
          const checked = selected.includes(type)
          return (
            <label key={type}>
              <input type="checkbox" checked={checked} disabled={full && !checked} onChange={() => toggle(type)} />
              {type}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
