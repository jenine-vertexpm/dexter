// checkA11y(page): runs the axe accessibility checker on the page as it is right now (M4 plan H6).
//
// Rules (decision D25): the WCAG 2.0 and 2.1 rules at levels A and AA, the bar the brief sets.
//   - serious or critical findings FAIL the test
//   - minor and moderate findings don't fail it, but are printed in the test output and attached
//     to the HTML report, so they are seen and triaged rather than silently ignored
//
// axe is injected by Playwright through the browser's debugging connection, not as a page script,
// so it works under our strict Content Security Policy without loosening it.
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

const WCAG_A_AND_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const BLOCKING = ['serious', 'critical']

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number]

// One readable line per problem and place: "[serious] color-contrast: … → .card-number"
function describe(violation: Violation): string[] {
  return violation.nodes.map(
    (node) => `[${violation.impact}] ${violation.id}: ${violation.help} → ${node.target.join(' ')}`,
  )
}

export async function checkA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_A_AND_AA).analyze()

  const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''))
  const nonBlocking = results.violations.filter((v) => !BLOCKING.includes(v.impact ?? ''))

  if (nonBlocking.length > 0) {
    const lines = nonBlocking.flatMap(describe)
    console.log(`Accessibility (minor/moderate, not failing) on ${page.url()}:\n  ${lines.join('\n  ')}`)
    await test.info().attach('axe minor and moderate findings', {
      body: JSON.stringify(nonBlocking, null, 2),
      contentType: 'application/json',
    })
  }

  expect(blocking.flatMap(describe), `Serious or critical accessibility problems on ${page.url()}`).toEqual([])
}
