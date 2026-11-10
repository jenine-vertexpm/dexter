import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { renderWithProviders, waitForPageToLoad } from '../test/render.tsx'

describe('Layout footer', () => {
  const original = globalThis.__DEXTER_CONFIG__
  afterEach(() => {
    globalThis.__DEXTER_CONFIG__ = original
  })

  it('shows the environment name from the runtime configuration', async () => {
    renderWithProviders(<App />, { url: '/teams' })
    await waitForPageToLoad()

    // "contentinfo" is the role of the page's <footer>
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Environment: test')
  })

  it('follows the configuration it was given, with nothing built in', async () => {
    globalThis.__DEXTER_CONFIG__ = { apiBaseUrl: 'https://pokeapi.co/api/v2', environment: 'production' }
    renderWithProviders(<App />, { url: '/teams' })
    await waitForPageToLoad()

    expect(screen.getByRole('contentinfo')).toHaveTextContent('Environment: production')
  })
})
