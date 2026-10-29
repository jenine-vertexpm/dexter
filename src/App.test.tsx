import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App.tsx'
import { listHandlers } from './test/handlers.ts'
import { renderWithProviders } from './test/render.tsx'
import { server } from './test/server.ts'

// The list page loads data, so the fake PokéAPI answers its requests
beforeEach(() => {
  server.use(...listHandlers().handlers)
})

// renderWithProviders uses a MemoryRouter: a router that keeps its address in memory instead
// of the browser's address bar, so each test can start at whichever URL it needs.
function renderAt(url: string) {
  return renderWithProviders(<App />, { url })
}

describe('routes', () => {
  it('shows the Pokémon list at /', () => {
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1, name: 'Pokémon' })).toBeInTheDocument()
  })

  it('shows the detail page for /pokemon/:name, with the name from the URL', () => {
    renderAt('/pokemon/eevee')

    expect(screen.getByRole('heading', { level: 1, name: 'eevee' })).toBeInTheDocument()
  })

  it.each(['/nope', '/pokemon', '/pokemon/eevee/extra'])('shows the not-found page for %s', (url) => {
    renderAt(url)

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })

  it('shows the layout header on every page', () => {
    renderAt('/nope')

    expect(screen.getByRole('banner')).toHaveTextContent('Dexter')
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})

describe('navigation', () => {
  it('goes back to the list from the header link', async () => {
    const user = userEvent.setup()
    renderAt('/pokemon/eevee')

    await user.click(screen.getByRole('link', { name: 'Dexter' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Pokémon' })).toBeInTheDocument()
  })

  it('goes back to the list from the not-found page', async () => {
    const user = userEvent.setup()
    renderAt('/nope')

    await user.click(screen.getByRole('link', { name: 'Back to the Pokémon list' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Pokémon' })).toBeInTheDocument()
  })
})
