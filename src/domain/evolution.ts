import type { ApiChainLink, ApiEvolutionChain } from '../api/schemas.ts'
import { idFromUrl } from './resourceId.ts'

// One species in an evolution chain and what it can evolve into.
// More than one entry in evolvesTo means the chain branches (Eevee has 8).
export interface EvolutionNode {
  name: string // species name, which is also the detail page URL: /pokemon/<name>
  id: number | null // species number, null if PokéAPI's link has no id
  evolvesTo: EvolutionNode[]
}

export function toEvolutionTree(chain: ApiEvolutionChain): EvolutionNode {
  return toNode(chain.chain)
}

function toNode(link: ApiChainLink): EvolutionNode {
  return {
    name: link.species.name,
    id: idFromUrl(link.species.url),
    evolvesTo: link.evolves_to.map(toNode),
  }
}
