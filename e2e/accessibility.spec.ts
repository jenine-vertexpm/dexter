import type { Page } from '@playwright/test'
import { checkA11y } from './a11y.ts'
import { expect, test } from './fixtures.ts'

// Automated accessibility checks (M4 plan H6): axe scans each important page and state once it has
// fully loaded. Rules and what fails: see checkA11y in ./a11y.ts. Like every E2E test, these run on
// the production container with the real CSP and the recorded PokéAPI answers.

async function createTeam(page: Page, name: string) {
  await page.goto('/teams')
  await page.getByLabel('Team name').fill(name)
  await page.getByRole('button', { name: 'Create team' }).click()
  await expect(page.getByRole('link', { name })).toBeVisible()
}

test.describe('Pokémon list', () => {
  test('normal', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('article')).toHaveCount(20)
    await expect(page.getByRole('article', { name: 'raticate' }).getByRole('list', { name: 'Types' })).toHaveText(
      /normal/,
    )
    await checkA11y(page)
  })

  test('filtered by two types', async ({ page }) => {
    await page.goto('/?type=fire&type=flying')
    await expect(page.getByRole('checkbox', { name: 'flying' })).toBeChecked()
    await expect(page.getByRole('article', { name: 'charizard' }).getByRole('list', { name: 'Types' })).toHaveText(
      /fire\s*flying/,
    )
    await checkA11y(page)
  })

  test('no results', async ({ page }) => {
    await page.goto('/?q=pikachuu')
    await expect(page.getByText("No Pokémon match 'pikachuu'")).toBeVisible()
    await checkA11y(page)
  })

  test('the team picker when there is no team yet', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Create a team first' })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(20)
    await checkA11y(page)
  })
})

test('Pokémon detail: eevee', async ({ page }) => {
  await page.goto('/pokemon/eevee')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('eevee')
  await expect(page.getByRole('region', { name: 'Evolution chain' }).getByRole('link')).toHaveCount(9)
  await checkA11y(page)
})

test('not-found page', async ({ page }) => {
  await page.goto('/pokemon/pikachuu')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
  await checkA11y(page)
})

test.describe('Teams page', () => {
  test('empty', async ({ page }) => {
    await page.goto('/teams')
    await expect(page.getByText("You don't have any teams yet.")).toBeVisible()
    await expect(page.getByLabel('Team file')).toBeEnabled() // the import section has loaded
    await checkA11y(page)
  })

  test('with teams', async ({ page }) => {
    await createTeam(page, 'Rain team')
    await createTeam(page, 'Sun team')
    await expect(page.getByLabel('Team file')).toBeEnabled()
    await checkA11y(page)
  })

  test('delete confirmation', async ({ page }) => {
    await createTeam(page, 'Rain team')
    await page.getByRole('button', { name: 'Delete Rain team' }).click()
    await expect(page.getByRole('button', { name: 'Yes, delete' })).toBeVisible()
    await checkA11y(page)
  })

  test('import error', async ({ page }) => {
    await page.goto('/teams')
    const input = page.getByLabel('Team file')
    await expect(input).toBeEnabled()
    await input.setInputFiles({ name: 'not-a-team.json', mimeType: 'application/json', buffer: Buffer.from('{oops') })
    await expect(page.getByRole('alert')).toContainText("Couldn't import not-a-team.json")
    await checkA11y(page)
  })

  test('the storage-problem notice, with unreadable saved data', async ({ page }) => {
    // Runs before the app's own code, so the app finds this when it reads storage at start-up
    await page.addInitScript(() => localStorage.setItem('dexter.teams', 'this is not JSON'))
    await page.goto('/teams')
    await expect(page.getByRole('region', { name: 'Problem with your saved teams' })).toBeVisible()
    await checkA11y(page)
  })
})

test('team page: members and analysis', async ({ page }) => {
  await createTeam(page, 'Rain team')
  await page.goto('/')
  for (const species of ['bulbasaur', 'charmander', 'squirtle']) {
    const card = page.getByRole('article', { name: species })
    await card.getByRole('button', { name: `Add to Rain team (${species})` }).click()
    await expect(card.getByRole('status')).toHaveText(`Added ${species} to Rain team.`)
  }
  await page.getByRole('article', { name: 'squirtle' }).getByRole('link', { name: 'View Rain team' }).click()
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['bulbasaur', 'charmander', 'squirtle'])
  await expect(page.getByRole('region', { name: 'Team analysis' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Average base stats' })).toBeVisible()
  await checkA11y(page)
})
