import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import type { Team } from '../domain/team.ts'
import { TEAMS_STORAGE_KEY } from '../storage/teamStorage.ts'
import { detailHandlers, listHandlers } from '../test/handlers.ts'
import { renderWithProviders } from '../test/render.tsx'
import { server } from '../test/server.ts'
import { SAVED_DATA_FILENAME } from './StorageNotice.tsx'

const ID_RAIN = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'
const ID_SUN = '0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d'
const RAIN: Team = { id: ID_RAIN, name: 'Rain team', members: [{ species: 'eevee', nickname: null }] }
const SUN: Team = { id: ID_SUN, name: 'Sun team', members: [] }

// What can be found in storage. Each is stored as-is, exactly as a person or another app left it.
// One valid team and one with an empty name, which can't be read
const SALVAGED = JSON.stringify({ version: 1, teams: [RAIN, { id: ID_SUN, name: '', members: [] }] })
const UNREADABLE = '{"version": 1, "teams": [oops'
const NEWER_VERSION = JSON.stringify({ version: 99, teams: [RAIN] })

function stored() {
  return localStorage.getItem(TEAMS_STORAGE_KEY)
}

function renderAt(url: string, storedTeams?: Team[] | string) {
  return renderWithProviders(<App />, { url, storedTeams })
}

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
      return { filename: link.download, text: await (createObjectURL.mock.calls[0][0] as Blob).text() }
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StorageNotice: a notice for each storage status', () => {
  it.each([
    ['salvaged', SALVAGED, "1 saved team couldn't be read. Your other teams are shown, but changes aren't saved until you choose."],
    ['unreadable', UNREADABLE, "Your saved teams couldn't be read."],
    ['newer-version', NEWER_VERSION, 'Your teams were saved by a newer version of Dexter.'],
  ])('%s: shows the notice and leaves the stored text untouched', (_, text, message) => {
    renderAt('/teams', text)

    expect(screen.getByRole('heading', { name: 'Problem with your saved teams' })).toBeInTheDocument()
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(stored()).toBe(text)
  })

  it('salvaged: counts several unreadable teams in the plural', () => {
    const text = JSON.stringify({ version: 1, teams: [RAIN, { id: 'bad' }, { id: 'worse' }] })
    renderAt('/teams', text)

    expect(screen.getByText(/^2 saved teams couldn't be read\./)).toBeInTheDocument()
  })

  it('unavailable: explains that teams only last for this tab, and teams still work', async () => {
    const user = userEvent.setup()
    // Reading window.localStorage throws in some browsers when storage is blocked
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    renderAt('/teams')

    expect(
      screen.getByText('Your browser is blocking storage, so teams will be lost when you close this tab.'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Team name'), 'Rain team{Enter}')
    expect(screen.getByRole('link', { name: 'Rain team' })).toBeInTheDocument()
  })

  it('save-failed: explains the change was not saved, and keeps it on screen', async () => {
    const user = userEvent.setup()
    renderAt('/teams', [RAIN])
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })

    await user.type(screen.getByLabelText('Team name'), 'Sun team{Enter}')

    expect(
      screen.getByText("Couldn't save your latest change (storage full). Export your teams to keep a copy."),
    ).toBeInTheDocument()
    // The change is kept in memory, not thrown away, and teams can still be changed
    expect(screen.getByRole('link', { name: 'Sun team' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rain team' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create team' })).toBeEnabled()
  })

  it('shows no notice when storage is working', () => {
    renderAt('/teams', [RAIN])

    expect(screen.queryByRole('heading', { name: 'Problem with your saved teams' })).not.toBeInTheDocument()
  })
})

describe('StorageNotice: team controls are disabled while waiting for a choice', () => {
  it.each([
    ['salvaged', SALVAGED],
    ['unreadable', UNREADABLE],
    ['newer-version', NEWER_VERSION],
  ])('%s: the create form is disabled, and storage is unchanged', async (_, text) => {
    const user = userEvent.setup()
    renderAt('/teams', text)

    expect(screen.getByLabelText('Team name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create team' })).toBeDisabled()
    // Typing into a disabled field does nothing, so nothing can be submitted
    await user.type(screen.getByLabelText('Team name'), 'Hail team{Enter}')
    expect(screen.queryByRole('link', { name: 'Hail team' })).not.toBeInTheDocument()
    expect(stored()).toBe(text)
  })

  it('salvaged: Rename and Delete are disabled on the teams that are shown', async () => {
    const user = userEvent.setup()
    renderAt('/teams', SALVAGED)

    expect(screen.getByRole('button', { name: 'Rename Rain team' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Rain team' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Delete Rain team' }))
    expect(screen.queryByRole('button', { name: 'Yes, delete' })).not.toBeInTheDocument()
    // The recovery buttons themselves stay usable
    expect(screen.getByRole('button', { name: 'Keep the valid teams' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Download original data' })).toBeEnabled()
    expect(stored()).toBe(SALVAGED)
  })

  it('a rename or delete already open when saving pauses can no longer be confirmed, only cancelled', async () => {
    const user = userEvent.setup()
    renderAt('/teams', [RAIN, SUN])
    await user.click(screen.getByRole('button', { name: 'Rename Rain team' }))
    await user.click(screen.getByRole('button', { name: 'Delete Sun team' }))

    // Another tab saves both teams plus one that can't be read (D17): saving pauses here,
    // while both teams stay on screen
    const fromOtherTab = JSON.stringify({ version: 1, teams: [RAIN, SUN, { id: 'bad' }] })
    act(() => {
      localStorage.setItem(TEAMS_STORAGE_KEY, fromOtherTab)
      window.dispatchEvent(new StorageEvent('storage', { key: TEAMS_STORAGE_KEY, newValue: fromOtherTab }))
    })

    expect(screen.getByLabelText("New name for 'Rain team'")).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeDisabled()
    // Both Cancel buttons (rename and delete) still work
    const cancels = screen.getAllByRole('button', { name: 'Cancel' })
    expect(cancels).toHaveLength(2)
    for (const cancel of cancels) expect(cancel).toBeEnabled()
    await user.click(cancels[0])
    expect(screen.getByRole('button', { name: 'Rename Rain team' })).toBeDisabled()
    expect(stored()).toBe(fromOtherTab)
  })

  it('controls are enabled again once a choice is made', async () => {
    const user = userEvent.setup()
    renderAt('/teams', SALVAGED)

    await user.click(screen.getByRole('button', { name: 'Keep the valid teams' }))

    expect(screen.getByLabelText('Team name')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Create team' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Rename Rain team' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete Rain team' })).toBeEnabled()
  })

  it('unavailable: controls stay enabled, because teams still work in memory', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    renderAt('/teams')

    expect(screen.getByLabelText('Team name')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Create team' })).toBeEnabled()
  })
})

describe('StorageNotice: downloading the original', () => {
  it.each([
    ['salvaged', SALVAGED, 'Download original data'],
    ['unreadable', UNREADABLE, 'Download saved data'],
    ['newer-version', NEWER_VERSION, 'Download saved data'],
  ])('%s: the file holds the exact stored text, and the temporary URL is released', async (_, text, button) => {
    const user = userEvent.setup()
    const downloads = stubDownloads()
    renderAt('/teams', text)

    await user.click(screen.getByRole('button', { name: button }))

    expect(await downloads.downloaded()).toEqual({ filename: SAVED_DATA_FILENAME, text })
    await waitFor(() => expect(downloads.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url'))
    // Downloading is not a choice: the notice stays and storage is unchanged
    expect(screen.getByRole('heading', { name: 'Problem with your saved teams' })).toBeInTheDocument()
    expect(stored()).toBe(text)
  })
})

describe('StorageNotice: keeping the valid teams (salvaged)', () => {
  it('saves only the valid teams, then changes are saved normally', async () => {
    const user = userEvent.setup()
    renderAt('/teams', SALVAGED)

    await user.click(screen.getByRole('button', { name: 'Keep the valid teams' }))

    expect(JSON.parse(stored()!)).toEqual({ version: 1, teams: [RAIN] })
    expect(screen.queryByRole('heading', { name: 'Problem with your saved teams' })).not.toBeInTheDocument()
    // Focus moves to the confirmation, since the button that was pressed has gone
    expect(screen.getByText('Kept your 1 valid team.')).toHaveFocus()

    await user.type(screen.getByLabelText('Team name'), 'Sun team{Enter}')
    expect(JSON.parse(stored()!).teams.map((team: Team) => team.name)).toEqual(['Rain team', 'Sun team'])
  })
})

describe('StorageNotice: starting with no teams (unreadable, newer-version)', () => {
  it.each([
    ['unreadable', UNREADABLE],
    ['newer-version', NEWER_VERSION],
  ])('%s: asks first; Cancel changes nothing', async (_, text) => {
    const user = userEvent.setup()
    renderAt('/teams', text)

    await user.click(screen.getByRole('button', { name: 'Start with no teams' }))
    expect(screen.getByText(/^Start with no teams\? This replaces your saved data/)).toBeInTheDocument()
    // Focus starts on Cancel, the safe choice
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(stored()).toBe(text)

    await user.keyboard('{Enter}')

    expect(screen.queryByRole('button', { name: 'Yes, start with no teams' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start with no teams' })).toHaveFocus()
    expect(stored()).toBe(text)
  })

  it.each([
    ['unreadable', UNREADABLE],
    ['newer-version', NEWER_VERSION],
  ])('%s: clears the data once confirmed, and a new team then persists', async (_, text) => {
    const user = userEvent.setup()
    const first = renderAt('/teams', text)

    await user.click(screen.getByRole('button', { name: 'Start with no teams' }))
    await user.click(screen.getByRole('button', { name: 'Yes, start with no teams' }))

    expect(JSON.parse(stored()!)).toEqual({ version: 1, teams: [] })
    expect(screen.queryByRole('heading', { name: 'Problem with your saved teams' })).not.toBeInTheDocument()
    expect(screen.getByText('Started with no teams. You can create a new team now.')).toHaveFocus()

    await user.type(screen.getByLabelText('Team name'), 'Hail team{Enter}')

    // Like a reload: a fresh app reading the same storage
    first.unmount()
    renderAt('/teams')
    expect(screen.getByRole('link', { name: 'Hail team' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Problem with your saved teams' })).not.toBeInTheDocument()
  })
})

describe('pages keep working when storage has problems', () => {
  it('the Teams list shows the readable teams beside the notice', () => {
    renderAt('/teams', SALVAGED)

    expect(screen.getByRole('heading', { level: 1, name: 'Teams' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rain team' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Problem with your saved teams' })).toBeInTheDocument()
  })

  it('a readable team’s page shows the team and the notice', () => {
    renderAt(`/teams/${ID_RAIN}`, SALVAGED)

    expect(screen.getByRole('heading', { level: 1, name: 'Rain team' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Problem with your saved teams' })).toBeInTheDocument()
    expect(stored()).toBe(SALVAGED)
  })

  it('a team page with unreadable data shows not-found with the notice explaining why', () => {
    renderAt(`/teams/${ID_RAIN}`, UNREADABLE)

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText("Your saved teams couldn't be read.")).toBeInTheDocument()
    expect(stored()).toBe(UNREADABLE)
  })

  it('the Pokémon list at / still works', async () => {
    server.use(...listHandlers().handlers)
    renderAt('/', UNREADABLE)

    expect(screen.getByRole('heading', { level: 1, name: 'Pokémon' })).toBeInTheDocument()
    expect((await screen.findAllByRole('article')).length).toBeGreaterThan(0)
    expect(stored()).toBe(UNREADABLE)
  })

  it('a Pokémon page at /pokemon/eevee still works', async () => {
    server.use(...detailHandlers())
    renderAt('/pokemon/eevee', NEWER_VERSION)

    expect(await screen.findByRole('heading', { level: 1, name: 'eevee' })).toBeInTheDocument()
    expect(stored()).toBe(NEWER_VERSION)
  })
})
