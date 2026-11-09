import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The PokéAPI request budget (brief §3.2, M4 plan H7 and §5.3):
//   - a cold load of the first list page makes no more than 25 requests to PokéAPI
//   - returning to a page already seen makes none
//
// Only requests to pokeapi.co count (decision D26). Artwork comes from GitHub's servers, not
// PokéAPI; it's measured by hand and reported separately in the README.
//
// The answers come from the recordings (./fixtures.ts), but the app doesn't know that: it makes
// exactly the requests it would make to the live API, so counting them here is a fair measure.

const BUDGET_COLD_FIRST_PAGE = 25

// Every PokéAPI request the page starts, in order
function countPokeApiRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).origin === 'https://pokeapi.co') urls.push(request.url())
  })
  return urls
}

// Page 1 fully loaded: 20 cards, and the last card's types shown (its /pokemon request answered)
async function expectFirstPageLoaded(page: Page) {
  await expect(page.getByRole('article')).toHaveCount(20)
  await expect(page.getByRole('article').first()).toHaveAccessibleName('bulbasaur')
  for (const card of await page.getByRole('article').all()) {
    await expect(card.getByRole('list', { name: 'Types' })).toBeVisible()
  }
}

// Proving that something does NOT happen needs a moment for it to have had the chance. Any
// refetch would start as soon as the page shows, so half a second after that is plenty.
async function settle(page: Page) {
  await page.waitForTimeout(500)
}

test('a cold load of the first list page stays within the budget', async ({ page }) => {
  const requests = countPokeApiRequests(page)

  await page.goto('/')
  await expectFirstPageLoaded(page)
  await settle(page)

  console.log(`Cold first page: ${requests.length} PokéAPI requests`)
  // Expected: the species index (1) + one /pokemon/<id> per card (20) = 21
  expect(requests.length).toBeLessThanOrEqual(BUDGET_COLD_FIRST_PAGE)
  // Nothing fetched twice
  expect(new Set(requests).size).toBe(requests.length)
})

test('going to page 2 and back to page 1 makes no new requests for page 1', async ({ page }) => {
  const requests = countPokeApiRequests(page)
  const pagination = page.getByRole('navigation', { name: 'Pages' })

  await page.goto('/')
  await expectFirstPageLoaded(page)

  await pagination.getByRole('link', { name: 'Next page' }).click()
  await expect(page.getByRole('article').first()).toHaveAccessibleName('spearow')
  await expect(page.getByRole('article', { name: 'wigglytuff' }).getByRole('list', { name: 'Types' })).toBeVisible()
  await settle(page)
  const beforeReturn = requests.length

  await pagination.getByRole('link', { name: 'Previous page' }).click()
  await expectFirstPageLoaded(page)
  await settle(page)

  expect(requests.slice(beforeReturn), 'PokéAPI requests made when returning to page 1').toEqual([])
})

test('opening a Pokémon and going Back to the list makes no new requests', async ({ page }) => {
  const requests = countPokeApiRequests(page)

  await page.goto('/')
  await expectFirstPageLoaded(page)

  await page.getByRole('article', { name: 'bulbasaur' }).getByRole('link').first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('bulbasaur')
  await expect(page.getByRole('region', { name: 'Evolution chain' }).getByRole('link')).toHaveCount(3)
  await settle(page)
  const beforeBack = requests.length

  await page.goBack()
  await expectFirstPageLoaded(page)
  await settle(page)

  expect(requests.slice(beforeBack), 'PokéAPI requests made when going Back to the list').toEqual([])
})
