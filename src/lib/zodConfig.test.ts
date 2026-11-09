import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import './zodConfig.ts'

// The setting itself. That main.tsx loads it before any schema, and that the browser then reports
// no CSP violation, is checked by the E2E tests against the real CSP (e2e/fixtures.ts).
describe('zod configuration', () => {
  it('turns on jitless mode, so zod never tries eval (blocked by our CSP)', () => {
    expect(z.config().jitless).toBe(true)
  })

  it('still checks data as before in jitless mode', () => {
    const schema = z.object({ name: z.string() })
    expect(schema.parse({ name: 'eevee', extra: 1 })).toEqual({ name: 'eevee' })
    expect(schema.safeParse({ name: 133 }).success).toBe(false)
  })
})
