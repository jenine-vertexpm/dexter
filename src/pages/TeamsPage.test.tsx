import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import type { Team } from '../domain/team.ts'
import { TEAMS_STORAGE_KEY } from '../storage/teamStorage.ts'
import { renderWithProviders } from '../test/render.tsx'

const ID_RAIN = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'
const ID_SUN = '0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d'
// Shaped like a team id, but no team has it
const ID_UNKNOWN = '11111111-2222-4333-8444-555555555555'

const RAIN: Team = {
  id: ID_RAIN,
  name: 'Rain team',
  members: [
    { species: 'pikachu', nickname: null },
    { species: 'eevee', nickname: null },
  ],
}
const SUN: Team = { id: ID_SUN, name: 'Sun team', members: [] }

// The whole app at `url`, so routes and the header are the real ones
function renderAt(url: string, storedTeams?: Team[] | string) {
  return renderWithProviders(<App />, { url, storedTeams })
}

function storedNames(): string[] {
  const text = localStorage.getItem(TEAMS_STORAGE_KEY)
  return text === null ? [] : JSON.parse(text).teams.map((team: Team) => team.name)
}

function teamLinks(): string[] {
  const list = screen.queryByRole('list')
  if (list === null) return []
  return within(list)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '')
}

// The list item (row) that holds a team's link
function row(name: string): HTMLElement {
  return screen.getByRole('link', { name }).closest('li')!
}

describe('TeamsPage: showing teams', () => {
  it('shows an empty state when there are no teams', () => {
    renderAt('/teams')

    expect(screen.getByRole('heading', { level: 1, name: 'Teams' })).toBeInTheDocument()
    expect(screen.getByText(/You don't have any teams yet/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('lists each team with its member count and a link to its page', () => {
    renderAt('/teams', [RAIN, SUN])

    expect(teamLinks()).toEqual(['Rain team', 'Sun team'])
    expect(row('Rain team')).toHaveTextContent('2/6 Pokémon')
    expect(row('Sun team')).toHaveTextContent('0/6 Pokémon')
    expect(screen.getByRole('link', { name: 'Rain team' })).toHaveAttribute('href', `/teams/${ID_RAIN}`)
    expect(screen.queryByText(/You don't have any teams yet/)).not.toBeInTheDocument()
  })

  it('opens the team page from its link', async () => {
    const user = userEvent.setup()
    renderAt('/teams', [RAIN])

    await user.click(screen.getByRole('link', { name: 'Rain team' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Rain team' })).toBeInTheDocument()
  })

  // Storage notices are tested in src/components/StorageNotice.test.tsx
})

describe('TeamsPage: creating a team', () => {
  it('creates a team, saves it and clears the field', async () => {
    const user = userEvent.setup()
    renderAt('/teams')

    await user.type(screen.getByLabelText('Team name'), '  Rain team ')
    await user.click(screen.getByRole('button', { name: 'Create team' }))

    // The name is trimmed before it's stored (D11)
    expect(teamLinks()).toEqual(['Rain team'])
    expect(storedNames()).toEqual(['Rain team'])
    expect(screen.getByLabelText('Team name')).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent("Created 'Rain team'.")
  })

  it.each([
    ['empty', '', 'Enter a team name.'],
    ['spaces only', '   ', 'Enter a team name.'],
    ['31 characters', 'a'.repeat(31), 'Team name must be 30 characters or fewer.'],
    // Duplicates ignore capital letters and surrounding spaces (D11)
    ['a duplicate', ' rain TEAM ', "A team called 'Rain team' already exists."],
  ])('rejects a name that is %s with an inline message', async (_, name, message) => {
    const user = userEvent.setup()
    renderAt('/teams', [RAIN])
    const field = screen.getByLabelText('Team name')

    if (name !== '') await user.type(field, name)
    await user.click(screen.getByRole('button', { name: 'Create team' }))

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    // aria-describedby links the field to the message, so a screen reader reads it with the field
    expect(field).toHaveAccessibleDescription(expect.stringContaining(message))
    expect(field).toHaveFocus()
    expect(storedNames()).toEqual(['Rain team'])
  })

  it('re-checks the name while typing once a message is shown', async () => {
    const user = userEvent.setup()
    renderAt('/teams', [RAIN])
    const field = screen.getByLabelText('Team name')

    // No message before the first submit, even for a name that clashes
    await user.type(field, 'rain team')
    expect(field).toHaveAttribute('aria-invalid', 'false')

    await user.click(screen.getByRole('button', { name: 'Create team' }))
    expect(screen.getByText("A team called 'Rain team' already exists.")).toBeInTheDocument()

    // Fixing the name clears the message straight away
    await user.type(field, 's')
    expect(screen.queryByText("A team called 'Rain team' already exists.")).not.toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'false')

    // Breaking it again shows a message again, still without submitting
    await user.clear(field)
    expect(screen.getByText('Enter a team name.')).toBeInTheDocument()
  })

  it('can be used with the keyboard only', async () => {
    const user = userEvent.setup()
    renderAt('/teams')

    // Tab from the start of the page: Dexter, Teams, then the name field
    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByLabelText('Team name')).toHaveFocus()
    await user.keyboard('Rain team{Enter}')

    expect(teamLinks()).toEqual(['Rain team'])
  })
})

describe('TeamsPage: renaming a team', () => {
  async function startRename(name: string) {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: `Rename ${name}` }))
    const field = screen.getByLabelText(`New name for '${name}'`)
    return { user, field }
  }

  it('renames a team inline and saves it', async () => {
    renderAt('/teams', [RAIN, SUN])
    const { user, field } = await startRename('Rain team')

    // The field opens focused, holding the current name
    expect(field).toHaveFocus()
    expect(field).toHaveValue('Rain team')
    await user.clear(field)
    await user.type(field, 'Storm team{Enter}')

    expect(teamLinks()).toEqual(['Storm team', 'Sun team'])
    expect(storedNames()).toEqual(['Storm team', 'Sun team'])
    // Focus goes back to the Rename button, so a keyboard user keeps their place
    expect(screen.getByRole('button', { name: 'Rename Storm team' })).toHaveFocus()
  })

  it('allows a different capitalisation of the same name', async () => {
    renderAt('/teams', [RAIN])
    const { user, field } = await startRename('Rain team')

    await user.clear(field)
    await user.type(field, 'RAIN TEAM{Enter}')

    expect(teamLinks()).toEqual(['RAIN TEAM'])
  })

  it.each([
    ['empty', '', 'Enter a team name.'],
    ['31 characters', 'a'.repeat(31), 'Team name must be 30 characters or fewer.'],
    ['another team’s name', '  sun team', "A team called 'Sun team' already exists."],
  ])('rejects a name that is %s with an inline message', async (_, name, message) => {
    renderAt('/teams', [RAIN, SUN])
    const { user, field } = await startRename('Rain team')

    await user.clear(field)
    if (name !== '') await user.type(field, name)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(expect.stringContaining(message))
    expect(field).toHaveFocus()
    expect(storedNames()).toEqual(['Rain team', 'Sun team'])
  })

  it('leaves the name unchanged on Cancel', async () => {
    renderAt('/teams', [RAIN])
    const { user, field } = await startRename('Rain team')

    await user.type(field, 'Storm')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(teamLinks()).toEqual(['Rain team'])
    expect(screen.getByRole('button', { name: 'Rename Rain team' })).toHaveFocus()
  })
})

describe('TeamsPage: deleting a team', () => {
  it('asks first, then deletes the team when confirmed', async () => {
    const user = userEvent.setup()
    renderAt('/teams', [RAIN, SUN])

    await user.click(screen.getByRole('button', { name: 'Delete Rain team' }))
    // Step 1 deletes nothing
    expect(teamLinks()).toEqual(['Rain team', 'Sun team'])
    expect(screen.getByText("Delete 'Rain team'? This can't be undone.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(teamLinks()).toEqual(['Sun team'])
    expect(storedNames()).toEqual(['Sun team'])
    expect(screen.getByRole('status')).toHaveTextContent("Deleted 'Rain team'.")
    expect(screen.getByRole('heading', { name: 'Your teams' })).toHaveFocus()
  })

  it('keeps the team when cancelled', async () => {
    const user = userEvent.setup()
    renderAt('/teams', [RAIN])

    await user.click(screen.getByRole('button', { name: 'Delete Rain team' }))
    // Focus starts on Cancel, the safe choice
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(teamLinks()).toEqual(['Rain team'])
    expect(storedNames()).toEqual(['Rain team'])
    expect(screen.getByRole('button', { name: 'Delete Rain team' })).toHaveFocus()
  })

  it('shows the empty state after the last team is deleted', async () => {
    const user = userEvent.setup()
    renderAt('/teams', [RAIN])

    await user.click(screen.getByRole('button', { name: 'Delete Rain team' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(screen.getByText(/You don't have any teams yet/)).toBeInTheDocument()
  })
})

describe('TeamsPage: persistence', () => {
  it('keeps created, renamed and deleted changes after the app starts again', async () => {
    const user = userEvent.setup()
    const first = renderAt('/teams', [RAIN, SUN])

    await user.type(screen.getByLabelText('Team name'), 'Hail team{Enter}')
    await user.click(screen.getByRole('button', { name: 'Rename Rain team' }))
    const field = screen.getByLabelText("New name for 'Rain team'")
    await user.clear(field)
    await user.type(field, 'Storm team{Enter}')
    await user.click(screen.getByRole('button', { name: 'Delete Sun team' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    // Like a reload: a fresh app reading the same localStorage
    first.unmount()
    renderAt('/teams')

    expect(teamLinks()).toEqual(['Storm team', 'Hail team'])
  })
})

describe('team routes', () => {
  it('shows the team placeholder page with the team name', () => {
    renderAt(`/teams/${ID_RAIN}`, [RAIN])

    expect(screen.getByRole('heading', { level: 1, name: 'Rain team' })).toBeInTheDocument()
    expect(screen.getByText('2/6 Pokémon')).toBeInTheDocument()
  })

  it.each([
    ['an unknown team id', `/teams/${ID_UNKNOWN}`],
    ['a malformed team id', '/teams/abc'],
    ['an extra path part', `/teams/${ID_RAIN}/extra`],
  ])('shows the not-found page for %s', (_, url) => {
    renderAt(url, [RAIN])

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })

  it('goes back to the Teams page from the team page', async () => {
    const user = userEvent.setup()
    renderAt(`/teams/${ID_RAIN}`, [RAIN])

    await user.click(screen.getByRole('link', { name: 'Back to your teams' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Teams' })).toBeInTheDocument()
  })
})
