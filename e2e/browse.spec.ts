import { expect, test } from './fixtures.ts'

// Journey 1: browse the list and move between pages (M4 plan H3).
// Data: the recorded species index (1025 species, so 52 pages of 20) and Pokémon #1–#40.

test('browse the Pokémon list and move between pages', async ({ page }) => {
  const cards = page.getByRole('article')
  const pagination = page.getByRole('navigation', { name: 'Pages' })

  // Page 1: 20 cards, starting with #0001 bulbasaur
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Pokémon' })).toBeVisible()
  await expect(cards).toHaveCount(20)
  await expect(pagination).toContainText('Page 1 of 52')
  await expect(pagination.getByRole('link', { name: 'Previous page' })).toHaveCount(0)

  const bulbasaur = page.getByRole('article', { name: 'bulbasaur' })
  await expect(cards.first()).toHaveAccessibleName('bulbasaur')
  await expect(bulbasaur).toContainText('#0001')
  // The types come from the recorded /pokemon/1 answer, so the card has fully loaded
  await expect(bulbasaur.getByRole('list', { name: 'Types' })).toHaveText(/grass\s*poison/)
  await expect(cards.last()).toHaveAccessibleName('raticate')

  // Next page: #0021–#0040, and the page number is in the URL
  await pagination.getByRole('link', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/\?page=2$/)
  await expect(pagination).toContainText('Page 2 of 52')
  await expect(cards).toHaveCount(20)
  await expect(cards.first()).toHaveAccessibleName('spearow')
  await expect(page.getByRole('article', { name: 'spearow' })).toContainText('#0021')
  await expect(cards.last()).toHaveAccessibleName('wigglytuff')
  await expect(page.getByRole('article', { name: 'wigglytuff' }).getByRole('list', { name: 'Types' })).toHaveText(
    /normal\s*fairy/,
  )

  // Previous page goes back to page 1
  await pagination.getByRole('link', { name: 'Previous page' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(pagination).toContainText('Page 1 of 52')
  await expect(cards.first()).toHaveAccessibleName('bulbasaur')

  // Each page change is a browser history entry, so Back returns to page 2 (decision D6)
  await page.goBack()
  await expect(page).toHaveURL(/\?page=2$/)
  await expect(cards.first()).toHaveAccessibleName('spearow')
})

// The footer names the environment the container was started with (brief §3.4, M5 R4). The name comes
// from /config.js, written when the container starts, so this checks the real runtime configuration.
// CI starts its container with DEXTER_ENVIRONMENT=ci and sets E2E_EXPECTED_ENVIRONMENT=ci;
// `npm run e2e` on your machine uses docker compose, which defaults to local.
test('the footer shows the environment name from the runtime configuration', async ({ page }) => {
  const expected = process.env.E2E_EXPECTED_ENVIRONMENT ?? 'local'
  await page.goto('/teams')
  await expect(page.getByRole('contentinfo')).toHaveText(`Environment: ${expected}`)
})
