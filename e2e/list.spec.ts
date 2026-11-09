import { expect, test } from './fixtures.ts'

// Journeys 2 and 3: search and type filtering on the list page (M4 plan H4)

test('search by name, with the search in the URL, and a search with no matches', async ({ page }) => {
  const cards = page.getByRole('article')
  const search = page.getByLabel('Search Pokémon by name')

  await page.goto('/')
  await expect(cards).toHaveCount(20)

  // Matches anywhere in the name, in number order
  await search.fill('char')
  await expect(page).toHaveURL(/\?q=char$/)
  await expect(cards).toHaveCount(7)
  const names = await cards.evaluateAll((articles) => articles.map((a) => a.getAttribute('aria-label')))
  expect(names).toEqual(['charmander', 'charmeleon', 'charizard', 'chimchar', 'charjabug', 'charcadet', 'pecharunt'])

  // A misspelt name finds nothing, and says so
  await search.fill('pikachuu')
  await expect(page).toHaveURL(/\?q=pikachuu$/)
  await expect(page.getByText("No Pokémon match 'pikachuu'")).toBeVisible()
  await expect(cards).toHaveCount(0)
})

test('filter by two types: only Pokémon with both, kept in the URL and after a reload', async ({ page }) => {
  const cards = page.getByRole('article')

  await page.goto('/')
  await expect(cards).toHaveCount(20)

  await page.getByRole('checkbox', { name: 'fire' }).check()
  await page.getByRole('checkbox', { name: 'flying' }).check()
  await expect(page).toHaveURL(/\?type=fire&type=flying$/)

  // Every card has both types (each card loads its own types, so wait for each list)
  async function expectOnlyFireFlying(): Promise<string[]> {
    await expect(cards.first()).toBeVisible()
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const types = cards.nth(i).getByRole('list', { name: 'Types' })
      await expect(types).toContainText('fire')
      await expect(types).toContainText('flying')
    }
    return cards.evaluateAll((articles) => articles.map((a) => a.getAttribute('aria-label') ?? ''))
  }
  const before = await expectOnlyFireFlying()
  expect(before).toContain('charizard')
  expect(before).not.toContain('charmander') // fire only

  // A reload starts from the URL: same filters, same Pokémon
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'fire' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'flying' })).toBeChecked()
  expect(await expectOnlyFireFlying()).toEqual(before)
})
