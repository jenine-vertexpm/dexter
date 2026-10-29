// PokéAPI links to resources by URL, e.g. https://pokeapi.co/api/v2/pokemon-species/133/.
// The number at the end is the resource's id. Returns null if the URL doesn't end in one.
export function idFromUrl(url: string): number | null {
  const match = /\/(\d+)\/?$/.exec(url)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
