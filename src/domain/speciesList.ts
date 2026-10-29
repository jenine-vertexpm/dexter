import type { ApiSpeciesIndex, ApiType } from '../api/schemas.ts'
import { idFromUrl } from './resourceId.ts'

export const PAGE_SIZE = 20

export interface SpeciesEntry {
  id: number
  name: string
}

// The species index as list entries, sorted by number. Entries without a usable id are dropped.
export function toSpeciesEntries(index: ApiSpeciesIndex): SpeciesEntry[] {
  const entries: SpeciesEntry[] = []
  for (const result of index.results) {
    const id = idFromUrl(result.url)
    if (id !== null) entries.push({ id, name: result.name })
  }
  return entries.sort((a, b) => a.id - b.id)
}

// The species numbers that have this type. A type's list contains Pokémon, including alternate
// forms (ids above 10000). We keep only ids that are species in the index, relying on
// "species id = default Pokémon id" (plan §5, A1). Forms are dropped, so each species counts once.
export function speciesIdsWithType(type: ApiType, speciesIds: ReadonlySet<number>): Set<number> {
  const ids = new Set<number>()
  for (const entry of type.pokemon) {
    const id = idFromUrl(entry.pokemon.url)
    if (id !== null && speciesIds.has(id)) ids.add(id)
  }
  return ids
}

export interface ListQuery {
  search: string
  // One set of species ids per chosen type (0, 1 or 2). A species must be in every set.
  typeFilters: readonly ReadonlySet<number>[]
  page: number // starts at 1
}

export interface ListResult {
  items: SpeciesEntry[] // the entries on this page
  total: number // matches across all pages
  totalPages: number // 0 when nothing matches
}

// Search, type filter and pagination, all in the browser (plan decision D4)
export function queryList(entries: readonly SpeciesEntry[], query: ListQuery): ListResult {
  const search = query.search.trim().toLowerCase()
  const matches = entries.filter(
    (entry) => entry.name.includes(search) && query.typeFilters.every((ids) => ids.has(entry.id)),
  )
  const start = (query.page - 1) * PAGE_SIZE
  return {
    items: matches.slice(start, start + PAGE_SIZE),
    total: matches.length,
    totalPages: Math.ceil(matches.length / PAGE_SIZE),
  }
}
