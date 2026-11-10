// The app's runtime configuration (M5 plan D32, step R3).
//
// The settings aren't built into the JavaScript: the container writes them into /config.js when it
// starts (docker/05-dexter-config.envsh, nginx/default.conf.template), and index.html loads that file
// before the app. It sets window.__DEXTER_CONFIG__. In `npm run dev` the file comes from vite.config.ts,
// and in unit tests from src/test/setup.ts.
//
// The container has already checked both values, but like every other input (API responses, storage,
// imported files) they're checked again here before use: /config.js could fail to load, or be an old copy.
import { z } from 'zod'

// Read through `globalThis`, which in a browser is the same object as `window`, so this is exactly what
// /config.js sets. Unlike `window`, it also exists in Node, where the smoke test (smoke/) runs our client.
declare global {
  // `unknown`: whatever /config.js left here can't be used until appConfigSchema has checked it.
  // (`var` is how TypeScript declares a property of the global object.)
  var __DEXTER_CONFIG__: unknown
}

// The same rules as the container's start-up check (M5 plan §6.1)
const appConfigSchema = z.object({
  // https only, lower-case host, optional port, URL-safe path, no trailing slash. e.g. https://pokeapi.co/api/v2
  apiBaseUrl: z
    .string()
    .regex(/^https:\/\/[a-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~/-]*)?$/)
    .refine((url) => !url.endsWith('/'), 'must not end with a slash'),
  // Shown in the footer, e.g. local or production
  environment: z.string().regex(/^[a-z][a-z0-9-]{0,19}$/),
})

export type AppConfig = z.infer<typeof appConfigSchema>

export class AppConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppConfigError'
  }
}

// Checks a value that is meant to be the configuration. Throws AppConfigError if it isn't.
export function parseAppConfig(value: unknown): AppConfig {
  if (value === undefined) {
    throw new AppConfigError('No configuration: /config.js did not load or did not set window.__DEXTER_CONFIG__')
  }
  const result = appConfigSchema.safeParse(value)
  if (!result.success) {
    throw new AppConfigError(`Invalid configuration in /config.js: ${result.error.message}`)
  }
  return result.data
}

// The configuration this page was loaded with. main.tsx calls this once before showing the app, and
// shows a short message instead if it throws, so the rest of the app only runs with a valid configuration.
export function getAppConfig(): AppConfig {
  return parseAppConfig(globalThis.__DEXTER_CONFIG__)
}
