import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { useLocation, useNavigate } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import speciesDeoxys from '../test/fixtures/species-deoxys.json'
import { API, fakePokemon, listHandlers } from '../test/handlers.ts'
import { renderWithProviders, waitForPageToLoad } from '../test/render.tsx'
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

async function renderList(url = '/') {
  const view = renderWithProviders(
    <>
      <App />
      <BrowserControls />
    </>,
    { url },
  )
  await waitForPageToLoad()
  return view
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
    await renderList()

    expect(screen.getByRole('status')).toHaveTextContent('Loading Pokémon…')
    const names = await cardNames()
    expect(names).toHaveLength(20)
    expect(names[0]).toBe(PAGE_1_FIRST)
    expect(screen.queryByText('Loading Pokémon…')).not.toBeInTheDocument()
  })

  it('shows an error with a retry button when the list fails, and loads it on retry', async () => {
    server.use(http.get(`${API}/pokemon-species`, () => new HttpResponse(null, { status: 500 }), { once: true }))
    const user = userEvent.setup()
    await renderList()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load the Pokémon list. PokéAPI had a problem (error 500).')

    await user.click(within(alert).getByRole('button', { name: 'Retry loading the Pokémon list' }))

    expect((await cardNames())[0]).toBe(PAGE_1_FIRST)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('pages in the URL', () => {
  it('shows the page the URL asks for', async () => {
    await renderList('/?page=2')

    expect(await cardNames()).toEqual(PAGE_2)
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
  })

  it('treats an invalid page in the URL as page 1', async () => {
    await renderList('/?page=abc')

    expect((await cardNames())[0]).toBe(PAGE_1_FIRST)
  })

  it('goes to the next page: the URL and the names change', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()

    await user.click(screen.getByRole('link', { name: 'Next page' }))

    expect(currentQuery()).toBe('?page=2')
    expect(await cardNames()).toEqual(PAGE_2)
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
  })

  it('returns to the earlier page with the browser’s Back button', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()
    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await cardNames()

    await user.click(screen.getByRole('button', { name: 'Browser back' }))

    expect(currentQuery()).toBe('')
    expect((await cardNames())[0]).toBe(PAGE_1_FIRST)
  })

  it('has no Previous link on the first page and no Next link on the last', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()
    expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await user.click(await screen.findByRole('link', { name: 'Next page' }))

    expect(await cardNames()).toHaveLength(6)
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument()
  })

  it('keeps other list settings in the URL when changing page', async () => {
    // "e" matches more than one page of species
    await renderList('/?q=e')
    await cardNames()

    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/?q=e&page=2')
  })

  it('explains a page past the end and links back to page 1', async () => {
    const user = userEvent.setup()
    await renderList('/?page=9')

    expect(await screen.findByText(/Page 9 does not exist\. There are only 3 pages\./)).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Go to page 1' }))

    expect((await cardNames())[0]).toBe(PAGE_1_FIRST)
  })

  it('makes no new requests when returning to a page already seen', async () => {
    const user = userEvent.setup()
    await renderList()
    // Wait until a card has loaded its types ("normal" is also a type filter checkbox, so look inside the card)
    await within(await screen.findByRole('article', { name: PAGE_1_FIRST })).findByText('normal')
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
    await renderList()

    const card = await screen.findByRole('article', { name: 'charmander' })

    expect(card).toHaveTextContent('#0004')
    expect(await within(card).findByRole('list', { name: 'Types' })).toHaveTextContent('normal')
    expect(within(card).getByRole('link')).toHaveAttribute('href', '/pokemon/charmander')
  })

  it('loads artwork lazily with its size reserved', async () => {
    await renderList()
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
    await renderList()

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
    await renderList()

    const card = await screen.findByRole('article', { name: PAGE_1_FIRST })

    expect(card).toHaveTextContent('#0001')
    expect(within(card).getByRole('status')).toHaveTextContent('Loading…')
  })

  it('shows an error with a retry button on a card that fails, and loads it on retry', async () => {
    server.use(http.get(`${API}/pokemon/5`, () => new HttpResponse(null, { status: 503 }), { once: true }))
    const user = userEvent.setup()
    await renderList()

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
    await renderList()

    const card = await screen.findByRole('article', { name: PAGE_1_FIRST })

    expect(await within(card).findByText('grass')).toBeInTheDocument()
    expect(card).toHaveTextContent('#0001')
  })
})

describe('search', () => {
  const searchBox = () => screen.getByRole('searchbox', { name: 'Search Pokémon by name' })

  it('finds Pokémon by part of the name, ignoring upper and lower case', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()

    await user.type(searchBox(), 'PIK')

    expect(currentQuery()).toBe('?q=PIK')
    expect(await cardNames()).toEqual(['pikachu'])

    await user.clear(searchBox())
    await user.type(searchBox(), 'saur')

    expect(await cardNames()).toEqual(['bulbasaur', 'ivysaur', 'venusaur'])
  })

  it('shows the search from the URL, so reloading or sharing the link keeps it', async () => {
    await renderList('/?q=pik')

    expect(await cardNames()).toEqual(['pikachu'])
    expect(searchBox()).toHaveValue('pik')
  })

  it('goes back to page 1 when the search changes, and keeps other settings in the URL', async () => {
    const user = userEvent.setup()
    // The fire filter has one page, so page 2 is past the end until the search resets it
    await renderList('/?type=fire&page=2')
    await screen.findByText(/Page 2 does not exist/)

    await user.type(searchBox(), 'a')

    expect(currentQuery()).toBe('?q=a&type=fire')
    expect(screen.getByText(/^Page 1 of/)).toBeInTheDocument()
  })

  it('says when nothing matches, showing the search as plain text', async () => {
    const user = userEvent.setup()
    const { container } = await renderList()
    await cardNames()

    await user.type(searchBox(), '<b>zz</b>')

    expect(screen.getByText("No Pokémon match '<b>zz</b>'")).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
  })

  it('adds one history entry for a search, not one per letter: Back returns to before the search', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()
    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await cardNames()

    await user.type(searchBox(), 'pik')
    expect(currentQuery()).toBe('?q=pik')

    // One Back skips every letter typed and lands on page 2, as it was before searching
    await user.click(screen.getByRole('button', { name: 'Browser back' }))

    expect(currentQuery()).toBe('?page=2')
    expect(searchBox()).toHaveValue('')
    expect(await cardNames()).toEqual(PAGE_2)
  })

  it('restores the earlier search and page with Back after a page change', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()
    await user.type(searchBox(), 'e')
    await user.click(screen.getByRole('link', { name: 'Next page' }))
    expect(currentQuery()).toBe('?q=e&page=2')

    await user.click(screen.getByRole('button', { name: 'Browser back' }))

    expect(currentQuery()).toBe('?q=e')
    expect(searchBox()).toHaveValue('e')
    expect(screen.getByText(/^Page 1 of/)).toBeInTheDocument()
  })

  it('never shows a result from an earlier search, and cancels its slow request', async () => {
    // Rattata matches "ra" but not "rai". Its request hangs until the test lets it finish.
    let rattataAborted = false
    let finishRattata = () => {}
    const rattataWaits = new Promise<void>((resolve) => {
      finishRattata = resolve
    })
    server.use(
      http.get(`${API}/pokemon/19`, async ({ request }) => {
        request.signal.addEventListener('abort', () => {
          rattataAborted = true
        })
        await rattataWaits
        return HttpResponse.json(fakePokemon(19, 'rattata'))
      }),
    )
    const user = userEvent.setup()
    const { queryClient } = await renderList('/?q=ra')
    expect(await cardNames()).toEqual(['rattata', 'raticate', 'raichu', 'nidoran-f'])
    expect(within(screen.getByRole('article', { name: 'rattata' })).getByRole('status')).toHaveTextContent('Loading…')

    await user.type(searchBox(), 'i')

    // The grid matches the latest search only
    expect(currentQuery()).toBe('?q=rai')
    expect(await cardNames()).toEqual(['raichu'])
    // Rattata's card is gone, so its request is no longer needed and is cancelled
    await waitFor(() => expect(rattataAborted).toBe(true))

    // Even when the slow response finally arrives, it is not used or shown
    finishRattata()
    await within(screen.getByRole('article', { name: 'raichu' })).findByText('normal')
    expect(screen.queryByRole('article', { name: 'rattata' })).not.toBeInTheDocument()
    expect(queryClient.getQueryData(['pokeapi', 'pokemon-summary', 19])).toBeUndefined()
  })
})

describe('type filter', () => {
  const typeBox = (name: string) => screen.getByRole('checkbox', { name })

  it('shows only Pokémon of one type', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()

    await user.click(typeBox('fire'))

    expect(currentQuery()).toBe('?type=fire')
    expect(typeBox('fire')).toBeChecked()
    expect(await cardNames()).toEqual(['charmander', 'charmeleon', 'charizard', 'flareon'])
  })

  it('with two types, shows only Pokémon that have both', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()

    await user.click(typeBox('fire'))
    await user.click(typeBox('flying'))

    expect(currentQuery()).toBe('?type=fire&type=flying')
    expect(await cardNames()).toEqual(['charizard'])
  })

  it('combines with the name search', async () => {
    const user = userEvent.setup()
    await renderList('/?q=p')
    await cardNames()

    await user.click(typeBox('flying'))

    expect(currentQuery()).toBe('?q=p&type=flying')
    expect(await cardNames()).toEqual(['pidgey', 'pidgeotto', 'pidgeot', 'spearow'])
  })

  it('goes back to page 1 and adds a history entry, so Back undoes the change', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()
    await user.click(screen.getByRole('link', { name: 'Next page' }))
    await cardNames()

    await user.click(typeBox('fire'))
    expect(currentQuery()).toBe('?type=fire')

    await user.click(screen.getByRole('button', { name: 'Browser back' }))

    expect(currentQuery()).toBe('?page=2')
    expect(typeBox('fire')).not.toBeChecked()
    expect(await cardNames()).toEqual(PAGE_2)
  })

  it('shows that types are loading, without showing unfiltered cards', async () => {
    server.use(
      http.get(`${API}/type/fire`, async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    const user = userEvent.setup()
    await renderList()
    await cardNames()

    await user.click(typeBox('fire'))

    expect(await screen.findByText('Loading types…')).toBeInTheDocument()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('shows an error with a retry button when a type fails, and filters on retry', async () => {
    server.use(http.get(`${API}/type/fire`, () => new HttpResponse(null, { status: 500 }), { once: true }))
    const user = userEvent.setup()
    await renderList('/?type=fire')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load the fire type. PokéAPI had a problem (error 500).')
    expect(screen.queryAllByRole('article')).toHaveLength(0)

    await user.click(within(alert).getByRole('button', { name: 'Retry loading the fire type' }))

    expect(await cardNames()).toEqual(['charmander', 'charmeleon', 'charizard', 'flareon'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says when nothing has the chosen types, naming the filters', async () => {
    await renderList('/?type=fire&type=water')

    expect(await screen.findByText('No Pokémon have the types fire and water.')).toBeInTheDocument()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('names the search and the type when nothing matches both', async () => {
    await renderList('/?q=squirt&type=fire')

    expect(await screen.findByText("No Pokémon match 'squirt' with the type fire.")).toBeInTheDocument()
  })

  it('restores types, search and page from a shared URL', async () => {
    await renderList('/?type=fire&type=flying&q=char&page=1')

    expect(await cardNames()).toEqual(['charizard'])
    expect(typeBox('fire')).toBeChecked()
    expect(typeBox('flying')).toBeChecked()
    expect(screen.getByRole('searchbox', { name: 'Search Pokémon by name' })).toHaveValue('char')
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
  })

  it('ignores unknown types and any type after the second in the URL', async () => {
    await renderList('/?type=stellar&type=fire&type=flying&type=water')

    expect(await cardNames()).toEqual(['charizard'])
    expect(typeBox('water')).not.toBeChecked()
    expect(counts.types.has('stellar')).toBe(false)
    expect(counts.types.has('water')).toBe(false)
  })

  it('blocks a third type and explains why', async () => {
    const user = userEvent.setup()
    await renderList('/?type=fire&type=flying')
    await cardNames()

    expect(typeBox('water')).toBeDisabled()
    expect(typeBox('fire')).toBeEnabled()
    expect(screen.getByRole('group', { name: 'Filter by type' })).toHaveAccessibleDescription(
      'You have chosen 2 types, the most allowed. Untick one to choose a different type.',
    )

    await user.click(typeBox('fire'))

    expect(typeBox('water')).toBeEnabled()
    expect(currentQuery()).toBe('?type=flying')
  })

  it('reuses a type it has already loaded', async () => {
    const user = userEvent.setup()
    await renderList()
    await cardNames()

    await user.click(typeBox('fire'))
    await screen.findByRole('article', { name: 'flareon' })
    await user.click(typeBox('fire'))
    await user.click(typeBox('fire'))
    await screen.findByRole('article', { name: 'flareon' })

    expect(counts.types.get('fire')).toBe(1)
  })
})
