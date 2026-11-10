import { expect, test } from '@playwright/test'

// Runtime configuration, seen from the app itself (M5 plan R5): in a real browser, the app sends its
// API requests to the configured base URL and shows the configured environment name in the footer.
// Same expected values as runtime-config.spec.ts (E2E_EXPECTED_ENVIRONMENT, E2E_EXPECTED_API_BASE_URL).
//
// Uses Playwright's own `test`, not ./fixtures.ts: the configured API may be any address (CI uses a
// made-up one), so every request outside the app is recorded and then blocked, never sent. If the CSP
// didn't allow the configured API, the browser would block the request itself, it would never be
// recorded, and this test would fail.

const expectedEnvironment = process.env.E2E_EXPECTED_ENVIRONMENT ?? 'local'
const expectedApiBaseUrl = process.env.E2E_EXPECTED_API_BASE_URL ?? 'https://pokeapi.co/api/v2'

test('the app uses the configured API address and shows the configured environment', async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL!).origin
  const outsideRequests: string[] = []
  const cspErrors: string[] = []

  page.on('console', (message) => {
    if (/Content Security Policy/.test(message.text())) cspErrors.push(message.text())
  })
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (new URL(url).origin === appOrigin) return route.continue()
    outsideRequests.push(url)
    return route.abort('blockedbyclient')
  })

  await page.goto('/')

  await expect(page.getByRole('contentinfo')).toHaveText(`Environment: ${expectedEnvironment}`)
  // The list page asks for the species index first
  await expect.poll(() => outsideRequests).toContain(`${expectedApiBaseUrl}/pokemon-species?limit=100000`)
  expect(outsideRequests.every((url) => url.startsWith(`${expectedApiBaseUrl}/`)), outsideRequests.join('\n')).toBe(
    true,
  )
  expect(cspErrors).toEqual([])
})
