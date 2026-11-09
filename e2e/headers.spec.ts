import { expect, test, type APIResponse } from '@playwright/test'

// The security headers and the Content Security Policy (M4 plan H5, §5.1), checked on the real
// production container. These tests ask the server directly for each address and read the headers
// it sends; no page is opened, so they don't need the recorded PokéAPI answers in ./fixtures.ts.
//
// They use E2E_BASE_URL like every E2E test, so M5 can run this same file against the deployed site.

const POKEAPI = 'https://pokeapi.co'
const ARTWORK_HOST = 'https://raw.githubusercontent.com'

// Every response must carry these, exactly
const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

// "default-src 'none'; img-src 'self' https://…" → { 'default-src': ["'none'"], 'img-src': ["'self'", 'https://…'] }
function parseCsp(header: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {}
  for (const part of header.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) directives[name.toLowerCase()] = values
  }
  return directives
}

function expectSecurityHeaders(response: APIResponse) {
  const headers = response.headers()
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(headers[name], `${name} on ${response.url()}`).toBe(value)
  }

  const csp = headers['content-security-policy']
  expect(csp, `content-security-policy on ${response.url()}`).toBeDefined()
  const policy = parseCsp(csp!)

  // Scripts: only our own files. No inline scripts and no eval, the two classic escape hatches.
  expect(policy['script-src']).not.toContain("'unsafe-inline'")
  expect(policy['script-src']).not.toContain("'unsafe-eval'")
  expect(policy['script-src']).toEqual(["'self'"])
  // Data only from PokéAPI, images only from us and the artwork host
  expect(policy['connect-src']).toEqual([POKEAPI])
  expect(policy['img-src']).toEqual(["'self'", ARTWORK_HOST])
  // The rest of the policy, exactly
  expect(policy).toEqual({
    'default-src': ["'none'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", ARTWORK_HOST],
    'connect-src': [POKEAPI],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
  })

  // server_tokens off: "nginx", without a version number
  expect(headers['server'] ?? '').not.toMatch(/\d/)
}

test('the home page has the security headers and must be re-checked by the browser each time', async ({ request }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  expectSecurityHeaders(response)
  expect(response.headers()['cache-control']).toBe('no-cache')
})

test('a deep link has the security headers too', async ({ request }) => {
  const response = await request.get('/pokemon/eevee')
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('<div id="root">') // nginx sent the app's index.html
  expectSecurityHeaders(response)
  expect(response.headers()['cache-control']).toBe('no-cache')
})

test('a fingerprinted asset has the security headers and is cached for a year', async ({ request }) => {
  // The build gives files names like /assets/index-BCLEmEtQ.js, so read the real one from the page
  const html = await (await request.get('/')).text()
  const asset = html.match(/\/assets\/[^"]+\.js/)?.[0]
  expect(asset, 'a /assets/….js script in index.html').toBeDefined()

  const response = await request.get(asset!)
  expect(response.status()).toBe(200)
  expectSecurityHeaders(response)
  expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
})

test('the health check has the security headers', async ({ request }) => {
  const response = await request.get('/healthz')
  expect(response.status()).toBe(200)
  expectSecurityHeaders(response)
})

test('an error response (a missing asset) still has the security headers', async ({ request }) => {
  const response = await request.get('/assets/does-not-exist.js')
  expect(response.status()).toBe(404)
  expectSecurityHeaders(response)
})
