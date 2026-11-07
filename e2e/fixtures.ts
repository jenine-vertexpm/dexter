// The shared setup every E2E test runs with (M4 plan §5.2). Tests import `test` and `expect`
// from here instead of from '@playwright/test', and get all of this automatically:
//   1. PokéAPI requests are answered from the recordings in e2e/fixtures/api/ (see recordings.ts)
//   2. artwork requests get one small placeholder image
//   3. any other outside request, or a PokéAPI request with no recording, is blocked and fails
//      the test, so the tests never touch the live API
//   4. any Content Security Policy (CSP) violation fails the test. (Nothing to catch until the
//      CSP is added in H5; from then on every test also proves the CSP doesn't break the app.)
//   5. each test starts with empty storage: Playwright gives every test a fresh browser context
import { test as base, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RECORDINGS_DIR, recordingFileFor, type Recording } from './recordings.ts'

const ARTWORK_ORIGIN = 'https://raw.githubusercontent.com'

// A 1×1 transparent PNG, standing in for every artwork image
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function readRecording(file: string): Promise<Recording | null> {
  try {
    return JSON.parse(await readFile(join(RECORDINGS_DIR, file), 'utf8')) as Recording
  } catch {
    return null
  }
}

export const test = base.extend<{ offlineNetwork: void; noCspViolations: void }>({
  // `auto: true` switches these on for every test without the test asking for them
  offlineNetwork: [
    async ({ context, baseURL }, use) => {
      const appOrigin = new URL(baseURL!).origin
      const blocked: string[] = []

      await context.route('**/*', async (route) => {
        const request = route.request()
        const url = request.url()
        const { origin } = new URL(url)

        // The app itself (HTML, scripts, styles) comes from the container
        if (origin === appOrigin) return route.continue()

        if (origin === ARTWORK_ORIGIN) {
          return route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER_PNG })
        }

        const file = recordingFileFor(url)
        const recording = file === null ? null : await readRecording(file)
        if (request.method() === 'GET' && recording !== null) {
          return route.fulfill({
            status: recording.status,
            contentType: 'application/json',
            // CORS: the app (on localhost) is allowed to read the answer, as with the real API
            headers: { 'access-control-allow-origin': '*' },
            body: recording.body === null ? 'Not Found' : JSON.stringify(recording.body),
          })
        }

        blocked.push(
          file === null
            ? `${request.method()} ${url} (an outside request the tests don't allow)`
            : `${request.method()} ${url} (no recording: expected e2e/fixtures/api/${file}; add it to e2e/record.ts and run npm run e2e:record)`,
        )
        return route.abort('blockedbyclient')
      })

      await use()

      expect(blocked, 'Requests were blocked because they have no recording or are not allowed').toEqual([])
    },
    { auto: true },
  ],

  noCspViolations: [
    async ({ context, page }, use) => {
      const violations: string[] = []

      // Runs in the browser before the app's own code, on every page the test opens
      await context.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(`CSP violation: ${event.violatedDirective} blocked ${event.blockedURI || 'inline code'}`)
        })
      })
      // Our own message above, plus the browser's own CSP error messages
      page.on('console', (message) => {
        const text = message.text()
        if (message.type() === 'error' && /CSP violation|Content Security Policy/.test(text)) violations.push(text)
      })

      await use()

      expect(violations, 'The page broke its Content Security Policy').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
