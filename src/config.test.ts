import { afterEach, describe, expect, it } from 'vitest'
import { AppConfigError, getAppConfig, parseAppConfig } from './config.ts'

const VALID = { apiBaseUrl: 'https://pokeapi.co/api/v2', environment: 'production' }

describe('parseAppConfig', () => {
  it('accepts a valid configuration', () => {
    expect(parseAppConfig(VALID)).toEqual(VALID)
  })

  it('accepts a host with a port and a URL with no path', () => {
    expect(parseAppConfig({ apiBaseUrl: 'https://api.example.test:8443', environment: 'ci' }).apiBaseUrl).toBe(
      'https://api.example.test:8443',
    )
  })

  it('reports a missing configuration (config.js did not load)', () => {
    expect(() => parseAppConfig(undefined)).toThrow(AppConfigError)
    expect(() => parseAppConfig(undefined)).toThrow(/did not load/)
  })

  it.each([
    ['not an object', 'production'],
    ['null', null],
    ['no apiBaseUrl', { environment: 'production' }],
    ['no environment', { apiBaseUrl: VALID.apiBaseUrl }],
    ['an http:// URL', { ...VALID, apiBaseUrl: 'http://pokeapi.co/api/v2' }],
    ['a javascript: URL', { ...VALID, apiBaseUrl: 'javascript:alert(1)' }],
    ['a trailing slash', { ...VALID, apiBaseUrl: 'https://pokeapi.co/api/v2/' }],
    ['a quote in the URL', { ...VALID, apiBaseUrl: 'https://pokeapi.co/a"b' }],
    ['an upper-case environment', { ...VALID, environment: 'Production' }],
    ['a quote in the environment', { ...VALID, environment: 'prod"};alert(1)//' }],
    ['an environment name over 20 characters', { ...VALID, environment: 'abcdefghijklmnopqrstu' }],
    ['an empty environment', { ...VALID, environment: '' }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseAppConfig(value)).toThrow(AppConfigError)
  })
})

describe('getAppConfig', () => {
  const original = globalThis.__DEXTER_CONFIG__
  afterEach(() => {
    globalThis.__DEXTER_CONFIG__ = original
  })

  it('reads the configuration /config.js left on window', () => {
    globalThis.__DEXTER_CONFIG__ = { apiBaseUrl: 'https://example.test/api', environment: 'demo' }
    expect(getAppConfig()).toEqual({ apiBaseUrl: 'https://example.test/api', environment: 'demo' })
  })

  it('throws when /config.js did not set anything', () => {
    globalThis.__DEXTER_CONFIG__ = undefined
    expect(() => getAppConfig()).toThrow(AppConfigError)
  })
})
