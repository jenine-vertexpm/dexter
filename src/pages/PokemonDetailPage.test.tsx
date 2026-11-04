import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { BATTLE_TYPES } from '../domain/battleTypes.ts'
import typeNormal from '../test/fixtures/type-normal.json'
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

describe('evolution chain', () => {
  const section = () => screen.getByRole('region', { name: 'Evolution chain' })
  // Waits until the chain has loaded: its first species is shown as a link
  const findChain = async (firstSpecies: string) => {
    await within(await screen.findByRole('region', { name: 'Evolution chain' })).findByRole('link', {
      name: firstSpecies,
    })
    return section()
  }

  // The tree as it is on screen, written compactly, e.g. "oddish > gloom > (vileplume | bellossom)".
  // It is read from the nested lists, so it fails if a branch is shown as a straight line.
  function describeList(list: Element): string {
    const items = [...list.children]
    const parts = items.map((item) => {
      const name = item.querySelector(':scope > a')?.textContent ?? '?'
      const next = item.querySelector(':scope > ul')
      return next ? `${name} > ${describeList(next)}` : name
    })
    return parts.length === 1 ? (parts[0] ?? '') : `(${parts.join(' | ')})`
  }
  const describeChain = (chain: HTMLElement) => describeList(within(chain).getAllByRole('list')[0] as Element)

  it('shows a linear chain as a line: bulbasaur → ivysaur → venusaur', async () => {
    renderDetail('/pokemon/bulbasaur')

    expect(describeChain(await findChain('bulbasaur'))).toBe('bulbasaur > ivysaur > venusaur')
  })

  it('shows all eight of Eevee’s evolutions as branches from Eevee', async () => {
    renderDetail('/pokemon/eevee')
    const chain = await findChain('eevee')

    expect(describeChain(chain)).toBe(
      'eevee > (vaporeon | jolteon | flareon | espeon | umbreon | leafeon | glaceon | sylveon)',
    )
    // Screen readers hear the same shape: a list with 1 item (eevee) that holds a list of 8
    const [outer, branches] = within(chain).getAllByRole('list')
    expect(outer?.children).toHaveLength(1)
    expect(branches?.children).toHaveLength(8)
  })

  it('keeps a later branch in place: gloom evolves into vileplume or bellossom', async () => {
    renderDetail('/pokemon/gloom')

    expect(describeChain(await findChain('oddish'))).toBe('oddish > gloom > (vileplume | bellossom)')
  })

  it('links every species in the chain to its detail page', async () => {
    renderDetail('/pokemon/eevee')
    const links = within(await findChain('eevee')).getAllByRole('link')

    const names = ['eevee', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon']
    expect(links.map((link) => link.getAttribute('href'))).toEqual(names.map((name) => `/pokemon/${name}`))
  })

  it('marks the Pokémon being viewed, and only that one', async () => {
    renderDetail('/pokemon/gloom')
    const chain = await findChain('oddish')

    const current = within(chain).getByRole('link', { name: 'gloom' })
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current.parentElement).toHaveTextContent(/^gloom \(this Pokémon\)/)
    const others = within(chain)
      .getAllByRole('link')
      .filter((link) => link !== current)
    others.forEach((link) => expect(link).not.toHaveAttribute('aria-current'))
  })

  it('goes to another species’ page from the chain', async () => {
    const user = userEvent.setup()
    renderDetail('/pokemon/gloom')

    await user.click(within(await findChain('oddish')).getByRole('link', { name: 'bellossom' }))

    await findTitle('bellossom')
    expect(within(await findChain('oddish')).getByRole('link', { name: 'bellossom' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows its own loading message while the rest of the page is already shown', async () => {
    server.use(
      http.get(`${API}/evolution-chain/:id`, async () => {
        await delay('infinite')
        return new HttpResponse(null, { status: 500 })
      }),
    )
    renderDetail('/pokemon/eevee')
    await findTitle('eevee')

    expect(await within(section()).findByRole('status')).toHaveTextContent('Loading evolution chain…')
    expect(screen.getByRole('meter', { name: 'HP' })).toBeInTheDocument()
  })

  it('shows an error with a retry inside the section, keeps the rest of the page, and loads on retry', async () => {
    server.use(http.get(`${API}/evolution-chain/:id`, () => new HttpResponse(null, { status: 500 }), { once: true }))
    const user = userEvent.setup()
    renderDetail('/pokemon/eevee')
    await findTitle('eevee')

    const alert = await within(section()).findByRole('alert')
    expect(alert).toHaveTextContent('Could not load the evolution chain. PokéAPI had a problem (error 500).')
    // The rest of the page is unaffected
    expect(screen.getByRole('img', { name: 'Official artwork of eevee' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'HP' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Abilities' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Retry loading the evolution chain' }))

    expect(describeChain(await findChain('eevee'))).toMatch(/^eevee > \(vaporeon/)
    expect(within(section()).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('type matchups', () => {
  const section = () => screen.getByRole('region', { name: 'Type matchups' })

  // Waits for the table, then reads it as [attacking type, multiplier text] rows, in order
  async function findMatchups(): Promise<[string, string][]> {
    const table = await within(await screen.findByRole('region', { name: 'Type matchups' })).findByRole('table')
    const bodyRows = within(table).getAllByRole('row').slice(1) // the first row is the header
    return bodyRows.map((row) => [
      within(row).getByRole('rowheader').textContent ?? '',
      within(row).getByRole('cell').textContent ?? '',
    ])
  }
  const asObject = (rows: [string, string][]) => Object.fromEntries(rows)

  it('shows a single-type Pokémon’s matchups (eevee, normal)', async () => {
    renderDetail('/pokemon/eevee')
    const matchups = asObject(await findMatchups())

    // From the real normal type: 2× from fighting, nothing from ghost, 1× from the rest
    expect(matchups.fighting).toBe('2×')
    expect(matchups.ghost).toBe('0×')
    const others = Object.entries(matchups).filter(([type]) => type !== 'fighting' && type !== 'ghost')
    expect(others).toHaveLength(16)
    others.forEach(([, value]) => expect(value).toBe('1×'))
  })

  it('combines both types of a dual-type Pokémon (scizor, bug/steel): 4×, ¼× and 0×', async () => {
    renderDetail('/pokemon/scizor')
    const matchups = asObject(await findMatchups())

    expect(matchups.fire).toBe('4×') // bug 2× and steel 2×
    expect(matchups.grass).toBe('¼×') // bug ½× and steel ½×
    expect(matchups.poison).toBe('0×') // steel is immune
    expect(matchups.fighting).toBe('1×') // bug ½× and steel 2× cancel out
  })

  it('lists exactly the 18 battle types, in order', async () => {
    renderDetail('/pokemon/scizor')
    const rows = await findMatchups()

    expect(rows).toHaveLength(18)
    expect(rows.map(([type]) => type)).toEqual([...BATTLE_TYPES])
  })

  it('never shows stellar, shadow or unknown, even if PokéAPI lists them', async () => {
    // A normal type whose damage relations also name the three non-battle types
    const extras = ['stellar', 'shadow', 'unknown'].map((name) => ({ name, url: `${API}/type/${name}/` }))
    const normalWithExtras = {
      ...typeNormal,
      damage_relations: {
        ...typeNormal.damage_relations,
        double_damage_from: [...typeNormal.damage_relations.double_damage_from, ...extras],
      },
    }
    server.use(http.get(`${API}/type/normal`, () => HttpResponse.json(normalWithExtras)))
    renderDetail('/pokemon/eevee')

    const rows = await findMatchups()

    expect(rows).toHaveLength(18)
    expect(within(section()).queryByText(/stellar|shadow|unknown/i)).not.toBeInTheDocument()
  })

  it('shows its own loading message while the rest of the page is already shown', async () => {
    server.use(
      http.get(`${API}/type/:name`, async () => {
        await delay('infinite')
        return new HttpResponse(null, { status: 500 })
      }),
    )
    renderDetail('/pokemon/eevee')
    await findTitle('eevee')

    expect(await within(section()).findByRole('status')).toHaveTextContent('Loading type matchups…')
    expect(screen.getByRole('meter', { name: 'HP' })).toBeInTheDocument()
  })

  it('shows an error with a retry inside the section, keeps the rest of the page, and loads on retry', async () => {
    // Steel fails once; bug loads. Retry asks again only for what failed.
    server.use(http.get(`${API}/type/steel`, () => new HttpResponse(null, { status: 500 }), { once: true }))
    const user = userEvent.setup()
    renderDetail('/pokemon/scizor')
    await findTitle('scizor')

    const alert = await within(section()).findByRole('alert')
    expect(alert).toHaveTextContent('Could not load the type matchups. PokéAPI had a problem (error 500).')
    // The rest of the page is unaffected
    expect(screen.getByRole('img', { name: 'Official artwork of scizor' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'HP' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Abilities' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Retry loading the type matchups' }))

    expect(asObject(await findMatchups()).fire).toBe('4×')
    expect(within(section()).queryByRole('alert')).not.toBeInTheDocument()
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
