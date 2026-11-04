import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { API, detailHandlers } from '../test/handlers.ts'
import { renderWithProviders } from '../test/render.tsx'
import { server } from '../test/server.ts'

beforeEach(() => {
  server.use(...detailHandlers())
})

// Lets a test change the address the way a link or the address bar would, while a page is loading
function GoTo({ url }: { url: string }) {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => void navigate(url)}>
      Go to {url}
    </button>
  )
}

function renderDetail(url: string, extra?: ReactNode) {
  return renderWithProviders(
    <>
      <App />
      {extra}
    </>,
    { url },
  )
}

// Waits until the page has loaded and shows this Pokémon's name as its main heading
const findTitle = (name: string) => screen.findByRole('heading', { level: 1, name })

describe('states', () => {
  it('shows a loading message first, then the Pokémon', async () => {
    renderDetail('/pokemon/eevee')

    expect(screen.getByRole('status')).toHaveTextContent('Loading Pokémon…')
    await findTitle('eevee')
    expect(screen.queryByText('Loading Pokémon…')).not.toBeInTheDocument()
  })

  it('shows an error with a retry button when the species fails, and loads it on retry', async () => {
    server.use(http.get(`${API}/pokemon-species/:name`, () => new HttpResponse(null, { status: 500 }), { once: true }))
    const user = userEvent.setup()
    renderDetail('/pokemon/eevee')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load eevee. PokéAPI had a problem (error 500).')

    await user.click(within(alert).getByRole('button', { name: 'Retry loading eevee' }))

    await findTitle('eevee')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error with a retry button when the Pokémon fails, and loads it on retry', async () => {
    server.use(http.get(`${API}/pokemon/:name`, () => HttpResponse.error(), { once: true }))
    const user = userEvent.setup()
    renderDetail('/pokemon/eevee')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load eevee. Could not reach PokéAPI. Check your connection.')

    await user.click(within(alert).getByRole('button', { name: 'Retry loading eevee' }))

    await findTitle('eevee')
  })

  // "pikachuu" is a typo; "pikachu-gmax" is a form, not a species. PokéAPI answers 404 for both.
  it.each(['pikachuu', 'pikachu-gmax'])('shows the not-found page for /pokemon/%s', async (name) => {
    renderDetail(`/pokemon/${name}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the Pokémon list' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('cancels the old requests and never shows the old Pokémon when the name changes', async () => {
    let deoxysSignal: AbortSignal | undefined
    server.use(
      http.get(`${API}/pokemon/deoxys-normal`, async ({ request }) => {
        deoxysSignal = request.signal
        await delay('infinite')
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderDetail('/pokemon/deoxys', <GoTo url="/pokemon/eevee" />)
    await waitFor(() => expect(deoxysSignal).toBeDefined())

    await user.click(screen.getByRole('button', { name: 'Go to /pokemon/eevee' }))

    await findTitle('eevee')
    expect(deoxysSignal?.aborted).toBe(true)
    expect(screen.queryByText(/deoxys/i)).not.toBeInTheDocument()
  })
})

describe('content', () => {
  it('resolves Deoxys through its default variety, deoxys-normal', async () => {
    const requested: string[] = []
    // Records every Pokémon request, then lets the normal handler answer it
    server.use(
      http.get(`${API}/pokemon/:name`, ({ params }) => {
        requested.push(String(params.name))
      }),
    )
    renderDetail('/pokemon/deoxys')

    await findTitle('deoxys')
    expect(requested).toEqual(['deoxys-normal'])
    expect(screen.getByText('#0386')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Types' })).getByText('psychic')).toBeInTheDocument()
    // Attack 150 comes from deoxys-normal's stats
    expect(screen.getByRole('meter', { name: 'Attack' })).toHaveAttribute('aria-valuenow', '150')
  })

  it('shows artwork, number, types, height, weight and the cleaned English description', async () => {
    renderDetail('/pokemon/eevee')
    await findTitle('eevee')

    const artwork = screen.getByRole('img', { name: 'Official artwork of eevee' })
    expect(artwork).toHaveAttribute('loading', 'lazy')
    expect(artwork).toHaveAttribute('width', '240')
    expect(artwork).toHaveAttribute('height', '240')
    expect(screen.getByText('#0133')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Types' })).getByText('normal')).toBeInTheDocument()
    // PokéAPI gives 3 decimetres and 65 hectograms
    expect(screen.getByText('0.3 m')).toBeInTheDocument()
    expect(screen.getByText('6.5 kg')).toBeInTheDocument()
    // The newest English entry, without the game's line breaks
    expect(
      screen.getByText(
        'Its genetic code is unstable, so it could evolve in a variety of ways. There are only a few alive.',
      ),
    ).toBeInTheDocument()
  })

  it('shows each base stat as a labelled bar that carries its number', async () => {
    renderDetail('/pokemon/eevee')
    await findTitle('eevee')

    const expected = [
      ['HP', '55'],
      ['Attack', '55'],
      ['Defense', '50'],
      ['Special Attack', '45'],
      ['Special Defense', '65'],
      ['Speed', '55'],
    ]
    for (const [label, value] of expected) {
      const bar = screen.getByRole('meter', { name: label })
      // For screen readers: the bar's value, out of the highest possible base stat
      expect(bar).toHaveAttribute('aria-valuenow', value)
      expect(bar).toHaveAttribute('aria-valuemax', '255')
      // For everyone: the number is written next to the bar
      expect(bar.closest('li')).toHaveTextContent(`${label}${value}`)
    }
  })

  it('marks the hidden ability in text', async () => {
    renderDetail('/pokemon/eevee')
    await findTitle('eevee')

    const abilities = within(screen.getByRole('region', { name: 'Abilities' })).getAllByRole('listitem')
    expect(abilities.map((item) => item.textContent)).toEqual([
      'run away',
      'adaptability',
      'anticipation (hidden ability)',
    ])
  })
})

describe('previous and next', () => {
  const nav = () => screen.findByRole('navigation', { name: 'Previous and next Pokémon' })

  it('links to the species before and after by number', async () => {
    renderDetail('/pokemon/pikachu')
    const links = within(await nav())

    expect(links.getByRole('link', { name: /previous/i })).toHaveAttribute('href', '/pokemon/arbok')
    expect(links.getByRole('link', { name: /previous/i })).toHaveTextContent('Previous: #0024 arbok')
    expect(links.getByRole('link', { name: /next/i })).toHaveAttribute('href', '/pokemon/raichu')
  })

  it('has no previous link on the first species', async () => {
    renderDetail('/pokemon/bulbasaur')
    const links = within(await nav())

    expect(links.queryByRole('link', { name: /previous/i })).not.toBeInTheDocument()
    expect(links.getByRole('link', { name: /next/i })).toHaveAttribute('href', '/pokemon/ivysaur')
  })

  it('has no next link on the last species', async () => {
    renderDetail('/pokemon/pecharunt')
    const links = within(await nav())

    expect(links.queryByRole('link', { name: /next/i })).not.toBeInTheDocument()
    expect(links.getByRole('link', { name: /previous/i })).toHaveAttribute('href', '/pokemon/sylveon')
  })

  it('goes to the next species when the link is followed', async () => {
    const user = userEvent.setup()
    renderDetail('/pokemon/pikachu')

    await user.click(within(await nav()).getByRole('link', { name: /next/i }))

    await findTitle('raichu')
    expect(within(await nav()).getByRole('link', { name: /previous/i })).toHaveAttribute('href', '/pokemon/pikachu')
  })
})
