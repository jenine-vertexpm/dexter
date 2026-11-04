import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import type { Team, TeamMember } from '../domain/team.ts'
import { TEAMS_STORAGE_KEY } from '../storage/teamStorage.ts'
import { detailHandlers, listHandlers } from '../test/handlers.ts'
import { renderWithProviders } from '../test/render.tsx'
import { server } from '../test/server.ts'

const ID_RAIN = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'
const ID_SUN = '0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d'

function members(...species: string[]): TeamMember[] {
  return species.map((name) => ({ species: name, nickname: null }))
}
function rain(...species: string[]): Team {
  return { id: ID_RAIN, name: 'Rain team', members: members(...species) }
}
const SUN: Team = { id: ID_SUN, name: 'Sun team', members: [] }
// Six species from the fixture index: a full team
const SIX = ['bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard']

function stored(): string | null {
  return localStorage.getItem(TEAMS_STORAGE_KEY)
}
function storedSpecies(teamId: string): string[] {
  const team = JSON.parse(stored()!).teams.find((t: Team) => t.id === teamId)
  return team.members.map((member: TeamMember) => member.species)
}

// The Pokémon page for eevee, with teams saved first. Detail handlers answer its requests.
async function renderEeveePage(storedTeams?: Team[] | string) {
  server.use(...detailHandlers())
  const view = renderWithProviders(<App />, { url: '/pokemon/eevee', storedTeams })
  await screen.findByRole('heading', { level: 1, name: 'eevee' })
  return view
}

// The Pokémon list, with teams saved first, once its cards have loaded
async function renderList(storedTeams?: Team[] | string) {
  server.use(...listHandlers().handlers)
  const view = renderWithProviders(<App />, { url: '/', storedTeams })
  await screen.findAllByRole('article')
  return view
}

function cardFor(species: string): HTMLElement {
  return screen.getByRole('article', { name: species })
}

describe('adding from a Pokémon’s page', () => {
  it('adds the Pokémon to the team, saves it, and it shows on the team’s page', async () => {
    const user = userEvent.setup()
    await renderEeveePage([rain()])

    expect(screen.getByLabelText('Add Pokémon to:')).toHaveDisplayValue('Rain team (0/6)')
    await user.click(screen.getByRole('button', { name: 'Add to Rain team (eevee)' }))

    expect(storedSpecies(ID_RAIN)).toEqual(['eevee'])
    expect(screen.getByRole('status')).toHaveTextContent('Added eevee to Rain team.')
    // The picker's count follows the shared team state
    expect(screen.getByLabelText('Add Pokémon to:')).toHaveDisplayValue('Rain team (1/6)')

    await user.click(screen.getByRole('link', { name: 'View Rain team' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Rain team' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'eevee' })).toBeInTheDocument()
  })

  it('keeps the addition after the app starts again', async () => {
    const user = userEvent.setup()
    const first = await renderEeveePage([rain('rattata')])
    await user.click(screen.getByRole('button', { name: 'Add to Rain team (eevee)' }))

    // Like a reload: a fresh app reading the same localStorage
    first.unmount()
    renderWithProviders(<App />, { url: `/teams/${ID_RAIN}` })

    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['rattata', 'eevee'])
  })

  // Note: Testing Library can't change a <select> with arrow keys (real browsers can), so the
  // option is picked with selectOptions; reaching the controls and adding use the keyboard only
  it('can be used with the keyboard: Tab to the picker and the button, Enter to add', async () => {
    const user = userEvent.setup()
    await renderEeveePage([rain(), SUN])
    const picker = screen.getByLabelText('Add Pokémon to:')

    // Tab through the page until the picker has focus
    for (let i = 0; i < 10 && document.activeElement !== picker; i++) await user.tab()
    expect(picker).toHaveFocus()
    await user.selectOptions(picker, 'Sun team (0/6)')
    expect(picker).toHaveDisplayValue('Sun team (0/6)')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Add to Sun team (eevee)' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(storedSpecies(ID_SUN)).toEqual(['eevee'])
    expect(storedSpecies(ID_RAIN)).toEqual([])
  })
})

describe('adding from a list card', () => {
  it('adds the card’s Pokémon to the chosen team, leaving other teams alone', async () => {
    const user = userEvent.setup()
    await renderList([rain(), SUN])

    await user.selectOptions(screen.getByLabelText('Add Pokémon to:'), 'Sun team (0/6)')
    await user.click(within(cardFor('rattata')).getByRole('button', { name: 'Add to Sun team (rattata)' }))

    expect(storedSpecies(ID_SUN)).toEqual(['rattata'])
    expect(storedSpecies(ID_RAIN)).toEqual([])
    // The result shows on the card that was used
    expect(within(cardFor('rattata')).getByRole('status')).toHaveTextContent('Added rattata to Sun team.')
    expect(within(cardFor('bulbasaur')).getByRole('status')).toHaveTextContent('')
  })

  it('uses the same chosen team on a Pokémon’s page', async () => {
    const user = userEvent.setup()
    // As in App.test.tsx: detail handlers last, so they answer the detail page's requests
    server.use(...listHandlers().handlers)
    server.use(...detailHandlers())
    renderWithProviders(<App />, { url: '/', storedTeams: [rain(), SUN] })
    await screen.findAllByRole('article')

    await user.selectOptions(screen.getByLabelText('Add Pokémon to:'), 'Sun team (0/6)')
    await user.click(within(cardFor('rattata')).getByRole('link'))
    await screen.findByRole('heading', { level: 1, name: 'rattata' })

    expect(screen.getByLabelText('Add Pokémon to:')).toHaveDisplayValue('Sun team (0/6)')
    await user.click(screen.getByRole('button', { name: 'Add to Sun team (rattata)' }))
    expect(storedSpecies(ID_SUN)).toEqual(['rattata'])
  })

  it('adds a sixth Pokémon to a team of five', async () => {
    const user = userEvent.setup()
    await renderList([rain(...SIX.slice(0, 5))])

    await user.click(within(cardFor('charizard')).getByRole('button', { name: 'Add to Rain team (charizard)' }))

    expect(storedSpecies(ID_RAIN)).toEqual(SIX)
    expect(within(cardFor('charizard')).getByRole('status')).toHaveTextContent('Added charizard to Rain team.')
    expect(screen.getByLabelText('Add Pokémon to:')).toHaveDisplayValue('Rain team (6/6)')
  })
})

describe('additions the team rules refuse', () => {
  it('refuses a seventh Pokémon, says the team is full, and changes nothing', async () => {
    const user = userEvent.setup()
    await renderList([rain(...SIX)])
    const before = stored()

    await user.click(within(cardFor('rattata')).getByRole('button', { name: 'Add to Rain team (rattata)' }))

    expect(within(cardFor('rattata')).getByRole('status')).toHaveTextContent('Rain team is full (6 of 6).')
    expect(stored()).toBe(before)
    expect(screen.getByLabelText('Add Pokémon to:')).toHaveDisplayValue('Rain team (6/6)')
  })

  it('refuses a seventh from a Pokémon’s page too', async () => {
    const user = userEvent.setup()
    await renderEeveePage([rain(...SIX)])
    const before = stored()

    await user.click(screen.getByRole('button', { name: 'Add to Rain team (eevee)' }))

    expect(screen.getByRole('status')).toHaveTextContent('Rain team is full (6 of 6).')
    expect(stored()).toBe(before)
  })

  it('refuses a species already in the team, and stores no duplicate', async () => {
    const user = userEvent.setup()
    await renderEeveePage([rain('rattata', 'eevee')])
    const before = stored()

    await user.click(screen.getByRole('button', { name: 'Add to Rain team (eevee)' }))

    expect(screen.getByRole('status')).toHaveTextContent("eevee is already in 'Rain team'.")
    expect(stored()).toBe(before)
    expect(storedSpecies(ID_RAIN)).toEqual(['rattata', 'eevee'])
  })
})

describe('when adding isn’t possible', () => {
  it('with no teams, links to the Teams page instead of showing Add buttons', async () => {
    const user = userEvent.setup()
    await renderList()

    expect(screen.queryByLabelText('Add Pokémon to:')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Add to/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Create a team first' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Teams' })).toBeInTheDocument()
  })

  it('with no teams, the Pokémon’s page links to the Teams page too', async () => {
    await renderEeveePage()

    expect(screen.getByRole('link', { name: 'Create a team first' })).toHaveAttribute('href', '/teams')
    expect(screen.queryByRole('button', { name: /^Add to/ })).not.toBeInTheDocument()
  })

  it('while a storage recovery choice is pending, the picker and Add buttons are disabled', async () => {
    // One readable team and one broken one: saving is paused until the user chooses (T5)
    const text = JSON.stringify({ version: 1, teams: [rain('rattata'), { id: 'broken' }] })
    await renderList(text)

    expect(screen.getByLabelText('Add Pokémon to:')).toBeDisabled()
    expect(screen.getByLabelText('Add Pokémon to:')).toHaveAccessibleDescription(/Adding Pokémon is paused/)
    for (const button of screen.getAllByRole('button', { name: /^Add to Rain team/ })) {
      expect(button).toBeDisabled()
    }
    expect(stored()).toBe(text)
  })

  it('while unreadable saved data waits for a choice, explains that adding is paused', async () => {
    await renderEeveePage('not json')

    expect(screen.getByText(/Adding Pokémon is paused/)).toBeInTheDocument()
    // Creating a team would be refused right now, so that link isn't offered
    expect(screen.queryByRole('link', { name: 'Create a team first' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Add to/ })).not.toBeInTheDocument()
    expect(stored()).toBe('not json')
  })
})
