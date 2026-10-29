import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { useLocation, useNavigate } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import speciesDeoxys from '../test/fixtures/species-deoxys.json'
import { API, fakePokemon, listHandlers } from '../test/handlers.ts'
import { renderWithProviders } from '../test/render.tsx'
import { server } from '../test/server.ts'

let counts: ReturnType<typeof listHandlers>['counts']

beforeEach(() => {
  const list = listHandlers()
  counts = list.counts
  server.use(...list.handlers)
})

// Shows the current URL's query string, and offers the browser's Back button, inside the test
function BrowserControls() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <p data-testid="current-query">{location.search}</p>
      <button type="button" onClick={() => void navigate(-1)}>
        Browser back
      </button>
    </>
  )
}

function renderList(url = '/') {
  return renderWithProviders(
    <>
      <App />
      <BrowserControls />
    </>,
    { url },
  )
}

// The names of the cards on screen, in order (each card is labelled with its name)
async function cardNames(): Promise<string[]> {
  const cards = await screen.findAllByRole('article')
  return cards.map((card) => card.getAttribute('aria-label') ?? '')
}

const currentQuery = () => screen.getByTestId('current-query').textContent

// The 46-species fixture in number order: page 1 is #1–#20, page 2 the next 20, page 3 the last 6
const PAGE_1_FIRST = 'bulbasaur'
const PAGE_2 = [
  'spearow', 'fearow', 'ekans', 'arbok', 'pikachu', 'raichu', 'sandshrew', 'sandslash', 'nidoran-f', 'nidorina',
  'oddish', 'gloom', 'vileplume', 'eevee', 'vaporeon', 'jolteon', 'flareon', 'bellossom', 'espeon', 'umbreon',
]

describe('loading the list', () => {
  it('shows a loading message first, then the first page', async () => {
    renderList()

    expect(screen.getByRole('status')).toHaveTextContent('Loading Pokémon…')
    const names = await cardNames()
    expect(names).toHaveLength(20)
    expect(names[0]).toBe(PAGE_1_FIRST)
    expect(screen.queryByText('Loading Pokémon…')).not.toBeInTheDocument()
  })

  it('shows an error with a retry button when the list fails, and loads it on retry', async () => {
    server.use(http.get(`${API}/pokemon-species`, () => new HttpResponse(null, { status: 500 }), { once: true }))
    const user = userEvent.setup()
    renderList()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load the Pokémon list. PokéAPI had a problem (error 500).')

    await user.click(within(alert).getByRole('button', { name: 'Retry loading the Pokémon list' }))

    expect((await cardNames())[0]).toBe(PAGE_1_FIRST)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('pages in the URL', () => {
  it('shows the page the URL asks for', async () => {
    renderList('/?page=2')

    expect(await cardNames()).toEqual(PAGE_2)
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
  })

  it('treats an invalid page in the URL as page 1', async () => {
    renderList('/?page=abc')

    expect((await cardNames())[0]).toBe(PAGE_1_FIRST)
  })

  it('goes to the next page: the URL and the names change', async () => {
    const user = userEvent.setup()
    renderList()
    await cardNames()

    await user.click(screen.getByRole('link', { name: 'Next page' }))

    expect(currentQuery()).toBe('?page=2')
    expect(await cardNames()).toEqual(PAGE_2)
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
  })

  it('returns to the earlier page with the browser’s Back button', async () => {
    const user = userEvent.setup()
    renderList()
    await cardNames()
    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await cardNames()

    await user.click(screen.getByRole('button', { name: 'Browser back' }))

    expect(currentQuery()).toBe('')
    expect((await cardNames())[0]).toBe(PAGE_1_FIRST)
  })

  it('has no Previous link on the first page and no Next link on the last', async () => {
    const user = userEvent.setup()
    renderList()
    await cardNames()
    expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await user.click(await screen.findByRole('link', { name: 'Next page' }))

    expect(await cardNames()).toHaveLength(6)
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument()
  })

  it('keeps other list settings in the URL when changing page', async () => {
    renderList('/?type=fire')
    await cardNames()

    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/?type=fire&page=2')
  })

  it('explains a page past the end and links back to page 1', async () => {
    const user = userEvent.setup()
    renderList('/?page=9')

    expect(await screen.findByText(/Page 9 does not exist\. There are only 3 pages\./)).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Go to page 1' }))

    expect((await cardNames())[0]).toBe(PAGE_1_FIRST)
  })

  it('makes no new requests when returning to a page already seen', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findAllByText('normal')
    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await screen.findByRole('article', { name: 'spearow' })
    await user.click(screen.getByRole('link', { name: 'Previous page' }))
    await screen.findByRole('article', { name: PAGE_1_FIRST })

    expect(counts.index).toBe(1)
    expect(counts.pokemon.get('1')).toBe(1)
    expect(counts.pokemon.get('20')).toBe(1)
  })
})

describe('cards', () => {
  it('shows number, name, artwork and types, and links to the detail page', async () => {
    renderList()

    const card = await screen.findByRole('article', { name: 'charmander' })

    expect(card).toHaveTextContent('#0004')
    expect(await within(card).findByRole('list', { name: 'Types' })).toHaveTextContent('normal')
    expect(within(card).getByRole('link')).toHaveAttribute('href', '/pokemon/charmander')
  })

  it('loads artwork lazily with its size reserved', async () => {
    renderList()
    const card = await screen.findByRole('article', { name: 'charmander' })
    await within(card).findByText('normal')

    // alt="" because the name is already written on the card; role "presentation" follows from that
    const image = within(card).getByRole('presentation')
    expect(image).toHaveAttribute('src', 'https://img.example/4.png')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('width', '120')
    expect(image).toHaveAttribute('height', '120')
  })

  it('shows a placeholder when a Pokémon has no artwork', async () => {
    server.use(
      http.get(`${API}/pokemon/4`, () =>
        HttpResponse.json({ ...fakePokemon(4, 'charmander'), sprites: { other: { 'official-artwork': { front_default: null } } } }),
      ),
    )
    renderList()

    const card = await screen.findByRole('article', { name: 'charmander' })

    expect(await within(card).findByText('No artwork')).toBeInTheDocument()
    expect(within(card).queryByRole('presentation')).not.toBeInTheDocument()
  })

  it('shows number and name straight away while the rest of the card loads', async () => {
    server.use(
      http.get(`${API}/pokemon/1`, async () => {
        await delay('infinite')
        return HttpResponse.json(fakePokemon(1, 'bulbasaur'))
      }),
    )
    renderList()

    const card = await screen.findByRole('article', { name: PAGE_1_FIRST })

    expect(card).toHaveTextContent('#0001')
    expect(within(card).getByRole('status')).toHaveTextContent('Loading…')
  })

  it('shows an error with a retry button on a card that fails, and loads it on retry', async () => {
    server.use(http.get(`${API}/pokemon/5`, () => new HttpResponse(null, { status: 503 }), { once: true }))
    const user = userEvent.setup()
    renderList()

    const card = await screen.findByRole('article', { name: 'charmeleon' })
    const alert = await within(card).findByRole('alert')
    expect(alert).toHaveTextContent('Could not load charmeleon. PokéAPI had a problem (error 503).')
    // Only that card failed
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    await user.click(within(alert).getByRole('button', { name: 'Retry loading charmeleon' }))

    expect(await within(card).findByText('normal')).toBeInTheDocument()
    expect(within(card).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('falls back to species → default Pokémon when Pokémon N belongs to another species (A1)', async () => {
    // Pretend Pokémon 1 is not Bulbasaur's default form any more
    server.use(
      http.get(`${API}/pokemon/1`, () => HttpResponse.json(fakePokemon(1, 'something-else', 'not-bulbasaur'))),
      http.get(`${API}/pokemon-species/bulbasaur`, () =>
        HttpResponse.json({
          ...speciesDeoxys,
          id: 1,
          name: 'bulbasaur',
          varieties: [{ is_default: true, pokemon: { name: 'bulbasaur-default', url: `${API}/pokemon/99999/` } }],
        }),
      ),
      http.get(`${API}/pokemon/bulbasaur-default`, () =>
        HttpResponse.json({
          ...fakePokemon(1, 'bulbasaur-default', 'bulbasaur'),
          types: [{ slot: 1, type: { name: 'grass', url: `${API}/type/12/` } }],
        }),
      ),
    )
    renderList()

    const card = await screen.findByRole('article', { name: PAGE_1_FIRST })

    expect(await within(card).findByText('grass')).toBeInTheDocument()
    expect(card).toHaveTextContent('#0001')
  })
})
