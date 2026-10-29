import { describe, expect, it } from 'vitest'
import chainBulbasaur from '../test/fixtures/evolution-chain-1-bulbasaur.json'
import chainOddish from '../test/fixtures/evolution-chain-18-oddish.json'
import chainEevee from '../test/fixtures/evolution-chain-67-eevee.json'
import { toEvolutionTree, type EvolutionNode } from './evolution.ts'

// A compact picture of a tree, e.g. "oddish > gloom > (vileplume | bellossom)"
function describeTree(node: EvolutionNode): string {
  if (node.evolvesTo.length === 0) return node.name
  if (node.evolvesTo.length === 1) return `${node.name} > ${describeTree(node.evolvesTo[0] as EvolutionNode)}`
  return `${node.name} > (${node.evolvesTo.map(describeTree).join(' | ')})`
}

describe('toEvolutionTree', () => {
  it('maps a linear chain', () => {
    expect(describeTree(toEvolutionTree(chainBulbasaur))).toBe('bulbasaur > ivysaur > venusaur')
  })

  it('maps a chain that branches at the first step', () => {
    expect(describeTree(toEvolutionTree(chainEevee))).toBe(
      'eevee > (vaporeon | jolteon | flareon | espeon | umbreon | leafeon | glaceon | sylveon)',
    )
  })

  it('maps a chain that branches at a later step', () => {
    expect(describeTree(toEvolutionTree(chainOddish))).toBe('oddish > gloom > (vileplume | bellossom)')
  })

  it('gives every species its number, read from the species link', () => {
    const tree = toEvolutionTree(chainBulbasaur)

    expect(tree.id).toBe(1)
    expect(tree.evolvesTo[0]?.id).toBe(2)
    expect(tree.evolvesTo[0]?.evolvesTo[0]?.id).toBe(3)
  })
})
