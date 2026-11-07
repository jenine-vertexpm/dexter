import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import type { Team, TeamMember } from '../domain/team.ts'
import { TEAMS_STORAGE_KEY } from '../storage/teamStorage.ts'
import { API, detailHandlers } from '../test/handlers.ts'
import { renderWithProviders, waitForPageToLoad } from '../test/render.tsx'
import { server } from '../test/server.ts'

const TEAM_ID = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'
// Shaped like a team id, but no team has it
const UNKNOWN_ID = '11111111-2222-4333-8444-555555555555'
const ARTWORK = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'

// Deoxys and Eevee are real PokéAPI responses; Pikachu is a fake one (see src/test/handlers.ts).
// Deoxys checks the default variety is used: its Pokémon is "deoxys-normal".
const MEMBERS: TeamMember[] = [
  { species: 'deoxys', nickname: null },
  { species: 'eevee', nickname: 'Fluffy' },
  { species: 'pikachu', nickname: null },
]

function team(members: TeamMember[] = MEMBERS): Team {
  return { id: TEAM_ID, name: 'Rain team', members }
}

// The fake PokéAPI answers every request the team page (and the Pokémon pages) make
beforeEach(() => {
  server.use(...detailHandlers())
})

async function renderTeam(members: TeamMember[] = MEMBERS) {
  const view = renderWithProviders(<App />, { url: `/teams/${TEAM_ID}`, storedTeams: [team(members)] })
  await waitForPageToLoad()
  return view
}

// The members as stored in localStorage
function storedMembers(): TeamMember[] {
  return JSON.parse(localStorage.getItem(TEAMS_STORAGE_KEY)!).teams[0].members
}

// The members as shown, top to bottom, by the species name in each card's heading
function shownSpecies(): string[] {
  return screen.queryAllByRole('heading', { level: 3 }).map((heading) => heading.textContent ?? '')
}

// One member's card (its list item), found from its heading
function card(species: string): HTMLElement {
  return screen.getByRole('heading', { level: 3, name: species }).closest('li')!
}

describe('TeamDetailPage: members', () => {
  it('shows the team name and the members in their saved order', async () => {
    await renderTeam()

    expect(screen.getByRole('heading', { level: 1, name: 'Rain team' })).toBeInTheDocument()
    expect(screen.getByText('3/6 Pokémon')).toBeInTheDocument()
    expect(shownSpecies()).toEqual(['deoxys', 'eevee', 'pikachu'])
    await within(card('pikachu')).findByText('#0025')
  })

  it('shows each member’s artwork, number, types, nickname and a link to its page', async () => {
    await renderTeam()

    const deoxys = card('deoxys')
    // The number comes from the species; the artwork and types from its default Pokémon
    expect(await within(deoxys).findByText('#0386')).toBeInTheDocument()
    expect(within(deoxys).getByRole('list', { name: 'Types' })).toHaveTextContent('psychic')
    const artwork = deoxys.querySelector('img')!
    expect(artwork).toHaveAttribute('src', `${ARTWORK}/386.png`)
    expect(artwork).toHaveAttribute('loading', 'lazy')
    expect(artwork).toHaveAttribute('width', '96')
    expect(artwork).toHaveAttribute('height', '96')
    expect(within(deoxys).getByRole('link', { name: 'deoxys' })).toHaveAttribute('href', '/pokemon/deoxys')
    expect(within(deoxys).queryByText(/Nickname:/)).not.toBeInTheDocument()

    const eevee = card('eevee')
    expect(await within(eevee).findByText('#0133')).toBeInTheDocument()
    expect(within(eevee).getByRole('list', { name: 'Types' })).toHaveTextContent('normal')
    expect(within(eevee).getByText(/Nickname:/)).toHaveTextContent('Nickname: Fluffy')
  })

  it('loads members through the shared cache, so their Pokémon pages need no new requests', async () => {
    const user = userEvent.setup()
    const requests: string[] = []
    server.events.on('request:start', ({ request }) => {
      requests.push(new URL(request.url).pathname)
    })
    const { queryClient } = await renderTeam()
    await within(card('eevee')).findByText('#0133')

    // The same cache entries the Pokémon detail page uses
    expect(queryClient.getQueryData(['pokeapi', 'species', 'deoxys'])).toBeDefined()
    expect(queryClient.getQueryData(['pokeapi', 'pokemon', 'deoxys-normal'])).toBeDefined()

    await user.click(within(card('eevee')).getByRole('link', { name: 'eevee' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'eevee' })).toBeInTheDocument()

    // Eevee's species and Pokémon were each requested once, by the team page
    expect(requests.filter((path) => path === '/api/v2/pokemon-species/eevee')).toHaveLength(1)
    expect(requests.filter((path) => path === '/api/v2/pokemon/eevee')).toHaveLength(1)
    server.events.removeAllListeners()
  })
})

describe('TeamDetailPage: loading and errors, per member', () => {
  it('shows a placeholder the size of the artwork while a member loads', async () => {
    server.use(
      http.get(`${API}/pokemon-species/eevee`, async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await renderTeam()

    const eevee = card('eevee')
    expect(within(eevee).getByText('Loading…')).toBeInTheDocument()
    expect(eevee.querySelector('.team-member-artwork')).toBeInTheDocument()
    // The other members load as normal
    expect(await within(card('deoxys')).findByText('#0386')).toBeInTheDocument()
  })

  it('shows an error with Retry for one member, without holding up the others; Retry loads it', async () => {
    const user = userEvent.setup()
    // The first request for Eevee's Pokémon fails; the next one goes to the normal handler
    server.use(
      http.get(`${API}/pokemon/eevee`, () => new HttpResponse(null, { status: 500 }), { once: true }),
    )
    await renderTeam()

    const eevee = card('eevee')
    expect(await within(eevee).findByRole('alert')).toHaveTextContent('Could not load eevee.')
    expect(await within(card('deoxys')).findByText('#0386')).toBeInTheDocument()
    expect(await within(card('pikachu')).findByText('#0025')).toBeInTheDocument()

    await user.click(within(eevee).getByRole('button', { name: 'Retry loading eevee' }))

    expect(await within(eevee).findByText('#0133')).toBeInTheDocument()
    expect(within(eevee).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows "could not be found" for an unknown species, and it can still be removed', async () => {
    const user = userEvent.setup()
    // A well-formed name that PokéAPI doesn't have (detailHandlers answers 404)
    await renderTeam([{ species: 'missingno', nickname: null }, ...MEMBERS])

    const missing = card('missingno')
    expect(await within(missing).findByText('This Pokémon could not be found.')).toBeInTheDocument()

    await user.click(within(missing).getByRole('button', { name: 'Remove missingno' }))

    expect(shownSpecies()).toEqual(['deoxys', 'eevee', 'pikachu'])
    expect(storedMembers().map((member) => member.species)).toEqual(['deoxys', 'eevee', 'pikachu'])
  })
})

describe('TeamDetailPage: Remove', () => {
  it('removes a member, keeps the others in order and saves', async () => {
    const user = userEvent.setup()
    await renderTeam()

    await user.click(screen.getByRole('button', { name: 'Remove eevee' }))

    expect(shownSpecies()).toEqual(['deoxys', 'pikachu'])
    expect(storedMembers()).toEqual([
      { species: 'deoxys', nickname: null },
      { species: 'pikachu', nickname: null },
    ])
    expect(screen.getByText('2/6 Pokémon')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Removed eevee from the team.')
    // The card is gone, so focus moves to the list heading
    expect(screen.getByRole('heading', { name: 'Members' })).toHaveFocus()
  })

  it('shows the empty state after the last member is removed', async () => {
    const user = userEvent.setup()
    await renderTeam([{ species: 'eevee', nickname: null }])

    await user.click(screen.getByRole('button', { name: 'Remove eevee' }))

    expect(screen.getByText(/This team has no Pokémon yet\./)).toBeInTheDocument()
    expect(storedMembers()).toEqual([])
  })
})

describe('TeamDetailPage: Move up and Move down (D16)', () => {
  it('disables Move up for the first member and Move down for the last', async () => {
    await renderTeam()

    expect(screen.getByRole('button', { name: 'Move deoxys up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move deoxys down' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Move eevee up' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Move eevee down' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Move pikachu up' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Move pikachu down' })).toBeDisabled()
  })

  it('moves a member up one place, saves, keeps focus on its button and announces the position', async () => {
    const user = userEvent.setup()
    await renderTeam()

    await user.click(screen.getByRole('button', { name: 'Move pikachu up' }))

    expect(shownSpecies()).toEqual(['deoxys', 'pikachu', 'eevee'])
    expect(storedMembers().map((member) => member.species)).toEqual(['deoxys', 'pikachu', 'eevee'])
    expect(screen.getByRole('button', { name: 'Move pikachu up' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('pikachu moved to position 2 of 3.')
  })

  it('moves a member down one place, with the keyboard', async () => {
    const user = userEvent.setup()
    await renderTeam()

    screen.getByRole('button', { name: 'Move deoxys down' }).focus()
    await user.keyboard('{Enter}')

    expect(shownSpecies()).toEqual(['eevee', 'deoxys', 'pikachu'])
    expect(storedMembers().map((member) => member.species)).toEqual(['eevee', 'deoxys', 'pikachu'])
    expect(screen.getByRole('button', { name: 'Move deoxys down' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('deoxys moved to position 2 of 3.')
  })

  it('moves focus to the other Move button when a member reaches the end', async () => {
    const user = userEvent.setup()
    await renderTeam()

    await user.click(screen.getByRole('button', { name: 'Move eevee up' }))

    expect(shownSpecies()).toEqual(['eevee', 'deoxys', 'pikachu'])
    // Move up is now disabled (eevee is first), so focus can't stay on it
    expect(screen.getByRole('button', { name: 'Move eevee up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move eevee down' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('eevee moved to position 1 of 3.')
  })

  it('keeps the new order after the app starts again', async () => {
    const user = userEvent.setup()
    const first = await renderTeam()
    await user.click(screen.getByRole('button', { name: 'Move pikachu up' }))
    await user.click(screen.getByRole('button', { name: 'Move pikachu up' }))

    // Like a reload: a fresh app reading the same localStorage
    first.unmount()
    renderWithProviders(<App />, { url: `/teams/${TEAM_ID}` })
    await waitForPageToLoad()

    expect(shownSpecies()).toEqual(['pikachu', 'deoxys', 'eevee'])
  })
})

describe('TeamDetailPage: nicknames (D12)', () => {
  async function saveNickname(species: string, text: string) {
    const user = userEvent.setup()
    const field = screen.getByLabelText(`Nickname for ${species}`)
    await user.clear(field)
    if (text !== '') await user.type(field, text)
    await user.click(screen.getByRole('button', { name: `Save nickname for ${species}` }))
    return field
  }

  it('sets a nickname: shown on the card and stored', async () => {
    await renderTeam()

    await saveNickname('pikachu', 'Sparky')

    expect(within(card('pikachu')).getByText(/Nickname:/)).toHaveTextContent('Nickname: Sparky')
    expect(storedMembers()[2]).toEqual({ species: 'pikachu', nickname: 'Sparky' })
    expect(screen.getByRole('status')).toHaveTextContent('Saved the nickname Sparky.')
  })

  it('changes a nickname, trimming the spaces at the ends', async () => {
    await renderTeam()

    // The field starts with the current nickname
    expect(screen.getByLabelText('Nickname for eevee')).toHaveValue('Fluffy')
    await saveNickname('eevee', '  Rémi ')

    expect(within(card('eevee')).getByText(/Nickname:/)).toHaveTextContent('Nickname: Rémi')
    expect(storedMembers()[1]).toEqual({ species: 'eevee', nickname: 'Rémi' })
  })

  it.each(['', '   '])('clears a nickname when saved as %j, storing null', async (text) => {
    await renderTeam()

    await saveNickname('eevee', text)

    expect(within(card('eevee')).queryByText(/Nickname:/)).not.toBeInTheDocument()
    expect(storedMembers()[1]).toEqual({ species: 'eevee', nickname: null })
    expect(screen.getByRole('status')).toHaveTextContent('Removed the nickname from eevee.')
  })

  it.each([
    ['Sparky!', 'Nickname can only contain letters, numbers and spaces.'],
    ['<b>', 'Nickname can only contain letters, numbers and spaces.'],
    ['a'.repeat(13), 'Nickname must be 12 characters or fewer.'],
  ])('rejects %j with an inline message and stores nothing', async (text, message) => {
    await renderTeam()

    const field = await saveNickname('eevee', text)

    expect(within(card('eevee')).getByText(message)).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(expect.stringContaining(message))
    expect(field).toHaveFocus()
    expect(within(card('eevee')).getByText(/Nickname:/)).toHaveTextContent('Nickname: Fluffy')
    expect(storedMembers()[1]).toEqual({ species: 'eevee', nickname: 'Fluffy' })
  })

  it('re-checks the nickname while typing once a message is shown', async () => {
    const user = userEvent.setup()
    await renderTeam()

    const field = await saveNickname('eevee', 'Sparky!')
    expect(field).toHaveAttribute('aria-invalid', 'true')

    await user.type(field, '{Backspace}')

    expect(field).toHaveAttribute('aria-invalid', 'false')
    expect(within(card('eevee')).queryByText(/can only contain/)).not.toBeInTheDocument()
  })
})

describe('TeamDetailPage: other states', () => {
  it('shows an empty state with a link to the Pokémon list', async () => {
    await renderTeam([])

    expect(screen.getByText(/This team has no Pokémon yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse the Pokémon list' })).toHaveAttribute('href', '/')
    expect(screen.getByText('0/6 Pokémon')).toBeInTheDocument()
  })

  it.each([
    ['an unknown team id', `/teams/${UNKNOWN_ID}`],
    ['a malformed team id', '/teams/abc'],
    ['an extra path part', `/teams/${TEAM_ID}/extra`],
  ])('shows the not-found page for %s', async (_, url) => {
    renderWithProviders(<App />, { url, storedTeams: [team()] })
    await waitForPageToLoad()

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })

  it('goes back to the Teams page', async () => {
    const user = userEvent.setup()
    await renderTeam()

    await user.click(screen.getByRole('link', { name: 'Back to your teams' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Teams' })).toBeInTheDocument()
  })

  it('disables every change control while saved teams wait for a recovery choice (T5)', async () => {
    // The team is readable; a second, broken team pauses saving
    const stored = JSON.stringify({ version: 1, teams: [team(), { id: 'broken' }] })
    renderWithProviders(<App />, { url: `/teams/${TEAM_ID}`, storedTeams: stored })
    await waitForPageToLoad()

    expect(screen.getByRole('heading', { name: 'Problem with your saved teams' })).toBeInTheDocument()
    for (const species of ['deoxys', 'eevee', 'pikachu']) {
      expect(screen.getByRole('button', { name: `Move ${species} up` })).toBeDisabled()
      expect(screen.getByRole('button', { name: `Move ${species} down` })).toBeDisabled()
      expect(screen.getByRole('button', { name: `Remove ${species}` })).toBeDisabled()
      expect(screen.getByLabelText(`Nickname for ${species}`)).toBeDisabled()
      expect(screen.getByRole('button', { name: `Save nickname for ${species}` })).toBeDisabled()
    }
    // The member data still loads, and nothing was written
    expect(await within(card('eevee')).findByText('#0133')).toBeInTheDocument()
    expect(localStorage.getItem(TEAMS_STORAGE_KEY)).toBe(stored)
  })
})

describe('TeamDetailPage: Export (T9)', () => {
  // jsdom can't save files, so the download is caught: the Blob handed to createObjectURL is what
  // the user would get. The link click is recorded instead of followed.
  function stubDownloads() {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    return {
      revokeObjectURL,
      async downloaded() {
        expect(click).toHaveBeenCalledTimes(1)
        const link = click.mock.contexts[0] as HTMLAnchorElement
        const blob = createObjectURL.mock.calls[0][0] as Blob
        return { filename: link.download, href: link.href, type: blob.type, text: await blob.text() }
      },
    }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('downloads the team as a §4.2 JSON file: name, members in order with nicknames, no id', async () => {
    const user = userEvent.setup()
    const downloads = stubDownloads()
    await renderTeam()

    await user.click(screen.getByRole('button', { name: 'Export team' }))

    const file = await downloads.downloaded()
    expect(file.filename).toBe('dexter-team-rain-team.json')
    expect(file.href).toBe('blob:fake-url')
    expect(file.type).toBe('application/json')
    expect(JSON.parse(file.text)).toEqual({
      format: 'dexter-team',
      version: 1,
      team: {
        name: 'Rain team',
        members: [
          { species: 'deoxys', nickname: null },
          { species: 'eevee', nickname: 'Fluffy' },
          { species: 'pikachu', nickname: null },
        ],
      },
    })
    expect(file.text).not.toContain(TEAM_ID)
    // The temporary URL is released once the download has started
    await waitFor(() => expect(downloads.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url'))
    expect(screen.getByRole('status')).toHaveTextContent('Exported Rain team.')
  })

  it('exports the team as it is now, after a move and a new nickname', async () => {
    const user = userEvent.setup()
    const downloads = stubDownloads()
    await renderTeam()

    await user.click(screen.getByRole('button', { name: 'Move pikachu up' }))
    await user.type(screen.getByLabelText('Nickname for pikachu'), 'Sparky')
    await user.click(screen.getByRole('button', { name: 'Save nickname for pikachu' }))
    await user.click(screen.getByRole('button', { name: 'Export team' }))

    const { text } = await downloads.downloaded()
    expect(JSON.parse(text).team.members).toEqual([
      { species: 'deoxys', nickname: null },
      { species: 'pikachu', nickname: 'Sparky' },
      { species: 'eevee', nickname: 'Fluffy' },
    ])
  })

  it('still exports while saving is paused, so the team can be kept safe (T5)', async () => {
    const user = userEvent.setup()
    const downloads = stubDownloads()
    // The team is readable; a second, broken team pauses saving
    const stored = JSON.stringify({ version: 1, teams: [team(), { id: 'broken' }] })
    renderWithProviders(<App />, { url: `/teams/${TEAM_ID}`, storedTeams: stored })
    await waitForPageToLoad()

    await user.click(screen.getByRole('button', { name: 'Export team' }))

    expect(JSON.parse((await downloads.downloaded()).text).team.name).toBe('Rain team')
    // Exporting changes nothing in storage
    expect(localStorage.getItem(TEAMS_STORAGE_KEY)).toBe(stored)
  })
})
