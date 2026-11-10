import { expect, test } from '@playwright/test'

// Runtime configuration (M5 plan R5, D32): the container must serve exactly the values it was started
// with. Request-only (no browser is opened), so it can also run against the deployed site (R8).
//
// The expected values come from the environment, matching what the container was given:
//   E2E_EXPECTED_ENVIRONMENT     (DEXTER_ENVIRONMENT)  default: local, as with `docker compose up`
//   E2E_EXPECTED_API_BASE_URL    (DEXTER_API_BASE_URL) default: PokéAPI, as with `docker compose up`
// CI runs this file twice against the SAME image: once with its `ci` container and once with a second
// container started with different values (.github/workflows/ci.yml).

const expectedEnvironment = process.env.E2E_EXPECTED_ENVIRONMENT ?? 'local'
const expectedApiBaseUrl = process.env.E2E_EXPECTED_API_BASE_URL ?? 'https://pokeapi.co/api/v2'
// https://pokeapi.co/api/v2 → https://pokeapi.co: the CSP lists origins, not paths
const expectedApiOrigin = new URL(expectedApiBaseUrl).origin

// The sources listed for one CSP directive, e.g. connect-src → ['https://pokeapi.co']
function cspSources(header: string | undefined, directive: string): string[] | undefined {
  const part = (header ?? '').split(';').find((p) => p.trim().split(/\s+/)[0] === directive)
  return part?.trim().split(/\s+/).slice(1)
}

test('/config.js holds the configuration the container was started with', async ({ request }) => {
  const response = await request.get('/config.js')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/^application\/javascript/)
  expect(response.headers()['cache-control']).toBe('no-cache')

  // window.__DEXTER_CONFIG__={...}; and nothing else
  const body = await response.text()
  const json = /^window\.__DEXTER_CONFIG__=(\{.*\});\s*$/.exec(body)?.[1]
  expect(json, `/config.js was: ${body}`).toBeDefined()
  expect(JSON.parse(json!)).toEqual({ apiBaseUrl: expectedApiBaseUrl, environment: expectedEnvironment })
})

for (const path of ['/', '/config.js', '/healthz']) {
  test(`the CSP on ${path} lets the app connect only to the configured API`, async ({ request }) => {
    const response = await request.get(path)
    expect(cspSources(response.headers()['content-security-policy'], 'connect-src')).toEqual([expectedApiOrigin])
  })
}

test('the health check answers without depending on the configured API', async ({ request }) => {
  const response = await request.get('/healthz')
  expect(response.status()).toBe(200)
  expect(await response.text()).toBe('ok\n')
})
