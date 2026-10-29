import { isBattleType, type BattleType } from './battleTypes.ts'

// The list's state, kept in the URL: /?q=char&type=fire&type=flying&page=2
export interface ListState {
  page: number // 1 or more
  search: string
  types: BattleType[] // 0, 1 or 2
}

export const MAX_SEARCH_LENGTH = 50
export const MAX_TYPES = 2

// The URL can be typed or edited by anyone, so every value is checked (brief §3.5).
// Anything invalid falls back to a safe default instead of causing an error.
export function parseListParams(params: URLSearchParams): ListState {
  return {
    page: parsePage(params.get('page')),
    // Not trimmed here: the search box shows this value, and trimming would delete a space
    // as soon as it is typed. The search itself ignores surrounding spaces.
    search: (params.get('q') ?? '').slice(0, MAX_SEARCH_LENGTH),
    types: parseTypes(params.getAll('type')),
  }
}

// The reverse: values at their default (page 1, no search, no types) are left out of the URL
export function toListParams(state: ListState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.search !== '') params.set('q', state.search)
  for (const type of state.types) params.append('type', type)
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

function parsePage(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 1 ? page : 1
}

// Known battle types only, no repeats, at most two; extra or unknown values are ignored
function parseTypes(values: readonly string[]): BattleType[] {
  const types: BattleType[] = []
  for (const value of values) {
    const name = value.toLowerCase()
    if (isBattleType(name) && !types.includes(name)) types.push(name)
    if (types.length === MAX_TYPES) break
  }
  return types
}
