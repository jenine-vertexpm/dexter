import { expect, test } from './fixtures.ts'

// Journeys 4 and 5: the Pokémon detail page (M4 plan H4)

test('a deep link to a Pokémon works and survives a reload; an unknown name shows not-found', async ({ page }) => {
  const title = page.getByRole('heading', { level: 1 })

  // Opened directly, not by clicking through: nginx must serve the app for this URL
  await page.goto('/pokemon/eevee')
  await expect(title).toHaveText('eevee')
  await expect(page.getByText('#0133')).toBeVisible()

  await page.reload()
  await expect(title).toHaveText('eevee')

  await page.goto('/pokemon/pikachuu')
  await expect(title).toHaveText('Page not found')
})

test('a branching evolution chain shows every evolution as a link', async ({ page }) => {
  await page.goto('/pokemon/eevee')
  const chain = page.getByRole('region', { name: 'Evolution chain' })

  const evolutions = ['vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon']
  for (const name of ['eevee', ...evolutions]) {
    await expect(chain.getByRole('link', { name, exact: true })).toBeVisible()
  }
  // eevee itself, plus its 8 evolutions, and nothing else
  await expect(chain.getByRole('link')).toHaveCount(1 + evolutions.length)
  await expect(chain.getByRole('link', { name: 'eevee', exact: true })).toHaveAttribute('aria-current', 'page')

  await chain.getByRole('link', { name: 'vaporeon' }).click()
  await expect(page).toHaveURL(/\/pokemon\/vaporeon$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('vaporeon')
})
