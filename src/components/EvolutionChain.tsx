import { Link } from 'react-router'
import { toEvolutionTree, type EvolutionNode } from '../domain/evolution.ts'
import { useEvolutionChain } from '../queries/pokeApiQueries.ts'
import { ErrorMessage } from './ErrorMessage.tsx'

interface EvolutionChainProps {
  chainId: number
  // The species whose page this is, e.g. "gloom". Marked in the chain.
  currentName: string
}

// The detail page's evolution section. It loads on its own, with its own loading and error +
// retry, so the rest of the page shows even if the chain fails to load (plan S10).
export function EvolutionChain({ chainId, currentName }: EvolutionChainProps) {
  const chain = useEvolutionChain(chainId)

  return (
    <section aria-labelledby="evolution-heading" className="evolution">
      <h2 id="evolution-heading">Evolution chain</h2>
      {chain.isPending && <p role="status">Loading evolution chain…</p>}
      {chain.isError && (
        <ErrorMessage error={chain.error} onRetry={() => void chain.refetch()} what="the evolution chain" />
      )}
      {chain.data && (
        // Nested lists keep the tree's shape: each species' list holds what it evolves into, so a
        // branch (gloom → vileplume or bellossom) is never flattened into a line. Screen readers
        // announce the nesting ("list, 2 items") the same way.
        <ul className="evolution-tree">
          <EvolutionEntry node={toEvolutionTree(chain.data)} currentName={currentName} />
        </ul>
      )}
    </section>
  )
}

function EvolutionEntry({ node, currentName }: { node: EvolutionNode; currentName: string }) {
  const isCurrent = node.name === currentName
  return (
    <li>
      {/* aria-current tells screen readers "current page"; the visible text and bold style show it on screen */}
      <Link
        to={`/pokemon/${node.name}`}
        aria-current={isCurrent ? 'page' : undefined}
        className={isCurrent ? 'evolution-current' : undefined}
      >
        {node.name}
      </Link>
      {isCurrent && <span aria-hidden="true"> (this Pokémon)</span>}
      {node.evolvesTo.length > 0 && (
        <ul>
          {node.evolvesTo.map((next) => (
            <EvolutionEntry key={next.name} node={next} currentName={currentName} />
          ))}
        </ul>
      )}
    </li>
  )
}
