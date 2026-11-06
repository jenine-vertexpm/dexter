import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import type { Team } from '../domain/team.ts'
import { TEAMS_STORAGE_KEY } from '../storage/teamStorage.ts'
import badNickname from '../test/fixtures/team-files/bad-nickname.json?raw'
import markupName from '../test/fixtures/team-files/markup-name.json?raw'
import newerVersion from '../test/fixtures/team-files/newer-version.json?raw'
import notJson from '../test/fixtures/team-files/not-json.json?raw'
import rainTeamFile from '../test/fixtures/team-files/rain-team.json?raw'
import sevenMembers from '../test/fixtures/team-files/seven-members.json?raw'
import unknownSpecies from '../test/fixtures/team-files/unknown-species.json?raw'
import { API, detailHandlers } from '../test/handlers.ts'
import { renderWithProviders } from '../test/render.tsx'
import { server } from '../test/server.ts'

const ID_RAIN = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'
const ID_SUN = '0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d'
const RAIN: Team = {
  id: ID_RAIN,
  name: 'Rain team',
  members: [
    { species: 'pikachu', nickname: 'Sparky' },
    { species: 'eevee', nickname: null },
  ],
}
const SUN: Team = { id: ID_SUN, name: 'Sun team', members: [{ species: 'deoxys', nickname: null }] }

// The fake PokéAPI answers the species index (for the species check) and team pages
beforeEach(() => {
  server.use(...detailHandlers())
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderTeams(storedTeams: Team[] | string = [SUN]) {
  return renderWithProviders(<App />, { url: '/teams', storedTeams })
}

// The saved data, exactly as stored
function storedText(): string | null {
  return localStorage.getItem(TEAMS_STORAGE_KEY)
}

function storedTeams(): Team[] {
  return JSON.parse(storedText()!).teams
}

function teamFile(text: string, name = 'team.json'): File {
  return new File([text], name, { type: 'application/json' })
}

// Waits for the species index (the input is disabled until then), then chooses the file
async function importFile(user: UserEvent, file: File) {
  const input = screen.getByLabelText('Team file')
  await waitFor(() => expect(input).toBeEnabled())
  await user.upload(input, file)
}

describe('TeamImport: a valid file', () => {
  it('adds a new team with a new id: same name, members in order, nicknames', async () => {
    const user = userEvent.setup()
    renderTeams()

    await importFile(user, teamFile(rainTeamFile, 'rain-team.json'))

    expect(await screen.findByRole('link', { name: 'Open Rain team' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent("Imported 'Rain team'.")
    const teams = storedTeams()
    expect(teams).toHaveLength(2)
    // The existing team is untouched, and the new one comes after it
    expect(teams[0]).toEqual(SUN)
    expect(teams[1]).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      name: 'Rain team',
      members: [
        { species: 'pikachu', nickname: 'Sparky' },
        { species: 'eevee', nickname: null },
        { species: 'deoxys', nickname: 'Space Rock' },
      ],
    })
    expect(teams[1].id).not.toBe(ID_SUN)
  })

  it('links to the new team', async () => {
    const user = userEvent.setup()
    renderTeams()
    await importFile(user, teamFile(rainTeamFile))

    await user.click(await screen.findByRole('link', { name: 'Open Rain team' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Rain team' })).toBeInTheDocument()
    const members = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(members).toEqual(['pikachu', 'eevee', 'deoxys'])
  })

  it('round-trips: export, delete, import gives the same team under a new id; a second import is rejected', async () => {
    const user = userEvent.setup()
    // Catch the exported file (jsdom can't save files)
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderWithProviders(<App />, { url: `/teams/${ID_RAIN}`, storedTeams: [RAIN, SUN] })

    // Export from the team page
    await user.click(screen.getByRole('button', { name: 'Export team' }))
    const exported = await (createObjectURL.mock.calls[0][0] as Blob).text()

    // Delete the original on the Teams page
    await user.click(screen.getByRole('link', { name: 'Back to your teams' }))
    await user.click(screen.getByRole('button', { name: 'Delete Rain team' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(storedTeams()).toEqual([SUN])

    // Import the exported file
    await importFile(user, teamFile(exported, 'dexter-team-rain-team.json'))
    await screen.findByRole('link', { name: 'Open Rain team' })
    const [, imported] = storedTeams()
    expect(imported).toEqual({ ...RAIN, id: imported.id })
    expect(imported.id).not.toBe(ID_RAIN)

    // The same file again: the name now exists, so it is rejected and nothing changes
    const before = storedText()
    await importFile(user, teamFile(exported, 'dexter-team-rain-team.json'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "A team called 'Rain team' already exists. Rename or delete that team, then import again.",
    )
    expect(storedText()).toBe(before)
  })
})

describe('TeamImport: hostile and invalid files (§3.5)', () => {
  it('rejects a 17 KB file without reading it', async () => {
    const user = userEvent.setup()
    renderTeams()
    const before = storedText()
    const file = teamFile('x'.repeat(17 * 1024), 'huge.json')
    const read = vi.spyOn(file, 'text')

    await importFile(user, file)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't import huge.json. Nothing was changed.")
    expect(alert).toHaveTextContent('This file is too big to be a Dexter team file (the limit is 16 KB).')
    expect(read).not.toHaveBeenCalled()
    expect(storedText()).toBe(before)
  })

  it.each([
    ['not-json.json', notJson, "This file isn't valid JSON, so it can't be a Dexter team file."],
    ['newer-version.json', newerVersion, 'This file was made by a newer version of Dexter (file version 2).'],
    ['seven-members.json', sevenMembers, 'A team can have at most 6 Pokémon.'],
    ['bad-nickname.json', badNickname, 'Pokémon 1 (pikachu): Nickname can only contain letters, numbers and spaces.'],
    ['unknown-species.json', unknownSpecies, 'Pokémon 1: "pikachuu" isn\'t a Pokémon species Dexter knows.'],
    ['unknown-species.json', unknownSpecies, 'Pokémon 2: "pikachu-gmax" isn\'t a Pokémon species Dexter knows.'],
  ])('%s: lists the problem in an alert, and existing teams are unchanged', async (fileName, text, message) => {
    const user = userEvent.setup()
    renderTeams([RAIN, SUN])
    const before = storedText()

    await importFile(user, teamFile(text, fileName))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(`Couldn't import ${fileName}. Nothing was changed.`)
    expect(within(alert).getAllByRole('listitem').map((item) => item.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining(message)]),
    )
    expect(storedText()).toBe(before)
    expect(storedTeams()).toEqual([RAIN, SUN])
  })

  it('rejects a name that clashes with an existing team (" RAIN team ")', async () => {
    const user = userEvent.setup()
    renderTeams([RAIN, SUN])
    const before = storedText()
    const text = JSON.stringify({ format: 'dexter-team', version: 1, team: { name: ' RAIN team ', members: [] } })

    await importFile(user, teamFile(text))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "A team called 'Rain team' already exists. Rename or delete that team, then import again.",
    )
    expect(storedText()).toBe(before)
  })

  it('imports a name containing markup, and shows it as text: no img element appears', async () => {
    const user = userEvent.setup()
    renderTeams()

    await importFile(user, teamFile(markupName))

    const name = '<img src=x onerror=alert(1)>'
    expect(await screen.findByRole('link', { name })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: `Open ${name}` })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(storedTeams()[1].name).toBe(name)
  })

  it('a rejection after a success replaces the success message', async () => {
    const user = userEvent.setup()
    renderTeams()
    await importFile(user, teamFile(rainTeamFile))
    await screen.findByRole('link', { name: 'Open Rain team' })

    await importFile(user, teamFile(notJson, 'not-json.json'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Rain team' })).not.toBeInTheDocument()
  })
})

describe('TeamImport: the species index', () => {
  it('keeps the file input disabled while the species index loads', async () => {
    server.use(
      http.get(`${API}/pokemon-species`, async () => {
        await delay('infinite')
      }),
    )
    renderTeams()

    expect(screen.getByLabelText('Team file')).toBeDisabled()
    expect(screen.getByText('Loading the list of Pokémon species…')).toBeInTheDocument()
  })

  it('shows an error with Retry if the species index fails; Retry makes importing possible', async () => {
    const user = userEvent.setup()
    server.use(http.get(`${API}/pokemon-species`, () => new HttpResponse(null, { status: 500 }), { once: true }))
    renderTeams()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the list of Pokémon species.')
    expect(screen.queryByLabelText('Team file')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry loading the list of Pokémon species' }))

    await importFile(user, teamFile(rainTeamFile))
    expect(await screen.findByRole('link', { name: 'Open Rain team' })).toBeInTheDocument()
  })
})

describe('TeamImport: saving paused (T5)', () => {
  it('disables importing while saved teams wait for a recovery choice', async () => {
    // One readable team and one broken one: saving is paused until the user chooses
    const stored = JSON.stringify({ version: 1, teams: [RAIN, { id: 'broken' }] })
    renderTeams(stored)

    expect(screen.getByRole('heading', { name: 'Problem with your saved teams' })).toBeInTheDocument()
    // Even once the species index has loaded
    await screen.findByText(/A \.json file exported from Dexter/)
    expect(screen.getByLabelText('Team file')).toBeDisabled()
    expect(storedText()).toBe(stored)
  })
})
