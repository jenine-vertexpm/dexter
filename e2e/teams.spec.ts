import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Journeys 6, 7 and 8: teams (M4 plan H4). Each test starts with no saved teams.

async function createTeam(page: Page, name: string) {
  await page.goto('/teams')
  await page.getByLabel('Team name').fill(name)
  await page.getByRole('button', { name: 'Create team' }).click()
  await expect(page.getByRole('link', { name })).toBeVisible()
}

// The species on the team page, in team order
const memberNames = (page: Page) => page.getByRole('heading', { level: 3 })

test('a team takes 6 Pokémon; a 7th is turned away', async ({ page }) => {
  await createTeam(page, 'Rain team')
  await page.goto('/')
  await expect(page.getByLabel('Add Pokémon to:')).toHaveValue(/.+/)

  const six = ['bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard']
  for (const [i, species] of six.entries()) {
    const card = page.getByRole('article', { name: species })
    await card.getByRole('button', { name: `Add to Rain team (${species})` }).click()
    await expect(card.getByRole('status')).toHaveText(`Added ${species} to Rain team.`)
    await expect(page.getByLabel('Add Pokémon to:')).toContainText(`Rain team (${i + 1}/6)`)
  }

  const squirtle = page.getByRole('article', { name: 'squirtle' })
  await squirtle.getByRole('button', { name: 'Add to Rain team (squirtle)' }).click()
  await expect(squirtle.getByRole('status')).toHaveText('Rain team is full (6 of 6).')

  await squirtle.getByRole('link', { name: 'View Rain team' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rain team')
  await expect(page.getByText('6/6 Pokémon')).toBeVisible()
  await expect(memberNames(page)).toHaveText(six)
})

test('a team, its member and nickname are still there after a reload', async ({ page }) => {
  await createTeam(page, 'Rain team')

  await page.goto('/pokemon/eevee')
  await page.getByRole('button', { name: 'Add to Rain team (eevee)' }).click()
  await page.getByRole('link', { name: 'View Rain team' }).click()
  await expect(page).toHaveURL(/\/teams\/[0-9a-f-]+$/)
  const teamUrl = page.url()

  await page.getByLabel('Nickname for eevee').fill('Sparky')
  await page.getByRole('button', { name: 'Save nickname for eevee' }).click()
  await expect(page.getByText('Nickname: Sparky')).toBeVisible()

  // Reloading the team page loads /teams/<id> straight from the server, and the team from storage
  await page.reload()
  await expect(page).toHaveURL(teamUrl)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rain team')
  await expect(memberNames(page)).toHaveText(['eevee'])
  await expect(page.getByText('Nickname: Sparky')).toBeVisible()
  await expect(page.getByLabel('Nickname for eevee')).toHaveValue('Sparky')

  // And the Teams list, reloaded too
  await page.goto('/teams')
  await page.reload()
  await expect(page.getByRole('listitem').filter({ hasText: 'Rain team' })).toContainText('1/6 Pokémon')
})

test('export a team, delete it, import the file: the same team comes back', async ({ page }, testInfo) => {
  await createTeam(page, 'Rain team')

  // Three members, then a nickname and a new order, so the file has something to get wrong
  await page.goto('/')
  for (const species of ['bulbasaur', 'charmander', 'squirtle']) {
    await page.getByRole('button', { name: `Add to Rain team (${species})` }).click()
  }
  await page.getByRole('article', { name: 'squirtle' }).getByRole('link', { name: 'View Rain team' }).click()
  await page.getByLabel('Nickname for charmander').fill('Blaze')
  await page.getByRole('button', { name: 'Save nickname for charmander' }).click()
  await page.getByRole('button', { name: 'Move squirtle up' }).click()
  const order = ['bulbasaur', 'squirtle', 'charmander']
  await expect(memberNames(page)).toHaveText(order)

  // Export: Playwright catches the download and saves it in this test's output folder
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export team' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('dexter-team-rain-team.json')
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)

  // Delete the team
  await page.goto('/teams')
  await page.getByRole('button', { name: 'Delete Rain team' }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.getByText("You don't have any teams yet.")).toBeVisible()

  // Import the file
  const input = page.getByLabel('Team file')
  await expect(input).toBeEnabled() // waits for the species list, which import checks names against
  await input.setInputFiles(file)
  await page.getByRole('link', { name: 'Open Rain team' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rain team')
  await expect(memberNames(page)).toHaveText(order)
  await expect(page.getByRole('listitem').filter({ hasText: 'charmander' })).toContainText('Nickname: Blaze')
  await expect(page.getByLabel('Nickname for bulbasaur')).toHaveValue('')
  await expect(page.getByLabel('Nickname for squirtle')).toHaveValue('')
})
