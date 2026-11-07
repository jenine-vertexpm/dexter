import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { BATTLE_TYPES } from '../domain/battleTypes.ts'
import type { TeamMember } from '../domain/team.ts'
import { API, detailHandlers } from '../test/handlers.ts'
import { renderWithProviders, waitForPageToLoad } from '../test/render.tsx'
import { server } from '../test/server.ts'

// The analysis is tested on the real team page: the member cards there load the members, and
// the analysis reads the same cache (see useTeamPokemon).
const TEAM_ID = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60'

// Deoxys (psychic) and Eevee (normal) are real PokéAPI responses. Pikachu and Bulbasaur are fake
// ones from src/test/handlers.ts, with the normal type and no stats.
function members(...species: string[]): TeamMember[] {
  return species.map((name) => ({ species: name, nickname: null }))
}

beforeEach(() => {
  server.use(...detailHandlers())
})

async function renderTeam(teamMembers: TeamMember[]) {
  const view = renderWithProviders(<App />, {
    url: `/teams/${TEAM_ID}`,
    storedTeams: [{ id: TEAM_ID, name: 'Rain team', members: teamMembers }],
  })
  await waitForPageToLoad()
  return view
}

function analysis(): HTMLElement {
  return screen.getByRole('region', { name: 'Team analysis' })
}

async function findTable(): Promise<HTMLElement> {
  return within(analysis()).findByRole('table')
}

// The text of each cell in an attacking type's row, after the type itself: weak, resist, immune, note
function rowCells(table: HTMLElement, type: string): string[] {
  const row = within(table).getByRole('rowheader', { name: new RegExp(`^${type}`) }).closest('tr')!
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '')
}

describe('TeamAnalysis: the table', () => {
  it('lists all 18 attacking types, in order', async () => {
    await renderTeam(members('deoxys', 'eevee', 'pikachu'))

    const table = await findTable()
    expect(within(table).getAllByRole('rowheader').map((header) => header.textContent)).toEqual([...BATTLE_TYPES])
  })

  it('shows weak, resist and immune as three separate columns of numbers', async () => {
    await renderTeam(members('deoxys', 'eevee', 'pikachu'))

    const table = await findTable()
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['Attacking type', 'Weak', 'Resist', 'Immune', 'Note'])
    // Fighting: Deoxys ½×, Eevee 2×, Pikachu 2×
    expect(rowCells(table, 'fighting')).toEqual(['2', '1', '0', ''])
    // Ghost: Deoxys 2×, Eevee 0×, Pikachu 0×
    expect(rowCells(table, 'ghost')).toEqual(['1', '0', '2', ''])
    // Water: neutral for all three
    expect(rowCells(table, 'water')).toEqual(['0', '0', '0', ''])
  })

  it('marks a shared weakness in words, and only that row', async () => {
    // Three normal-type members: all weak to fighting, none resists or is immune
    await renderTeam(members('eevee', 'pikachu', 'bulbasaur'))

    const table = await findTable()
    expect(rowCells(table, 'fighting')).toEqual(['3', '0', '0', '⚠ Shared weakness'])
    expect(within(table).getAllByText('Shared weakness')).toHaveLength(1)
    // Ghost: all three are immune, which is not a weakness
    expect(rowCells(table, 'ghost')).toEqual(['0', '0', '3', ''])
  })

  it('removes the mark when a member that resists is in the team, and brings it back when that member leaves', async () => {
    const user = userEvent.setup()
    // Deoxys (psychic) resists fighting
    await renderTeam(members('eevee', 'pikachu', 'bulbasaur', 'deoxys'))

    const table = await findTable()
    expect(rowCells(table, 'fighting')).toEqual(['3', '1', '0', ''])

    await user.click(screen.getByRole('button', { name: 'Remove deoxys' }))

    expect(rowCells(await findTable(), 'fighting')).toEqual(['3', '0', '0', '⚠ Shared weakness'])
  })

  it('shows the average base stats to 1 decimal', async () => {
    await renderTeam(members('eevee', 'deoxys'))

    await findTable()
    const meters = within(analysis()).getAllByRole('meter')
    // Eevee 55/55/50/45/65/55, Deoxys 50/150/50/150/50/150
    expect(meters.map((meter) => meter.getAttribute('aria-valuenow'))).toEqual(['52.5', '102.5', '50', '97.5', '57.5', '102.5'])
    expect(within(analysis()).getByRole('meter', { name: 'Defense' }).previousElementSibling).toHaveTextContent(/^50\.0$/)
    expect(within(analysis()).getByRole('meter', { name: 'HP' }).previousElementSibling).toHaveTextContent(/^52\.5$/)
  })
})

describe('TeamAnalysis: loading, errors and empty team', () => {
  it('shows a loading message while the types load', async () => {
    server.use(
      http.get(`${API}/type/psychic`, async () => {
        await delay('infinite')
      }),
    )
    await renderTeam(members('deoxys', 'eevee'))

    // The members load, but the analysis waits for psychic
    expect(await screen.findByText('#0386')).toBeInTheDocument()
    expect(within(analysis()).getByRole('status')).toHaveTextContent('Loading the team analysis…')
    expect(within(analysis()).queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an error with Retry when a type fails to load; Retry loads the analysis', async () => {
    const user = userEvent.setup()
    server.use(http.get(`${API}/type/psychic`, () => new HttpResponse(null, { status: 500 }), { once: true }))
    await renderTeam(members('deoxys', 'eevee'))

    expect(await within(analysis()).findByRole('alert')).toHaveTextContent('Could not load the team analysis.')

    await user.click(within(analysis()).getByRole('button', { name: 'Retry loading the team analysis' }))

    expect(await findTable()).toBeInTheDocument()
    expect(within(analysis()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the rest of the team page working while the analysis has failed', async () => {
    const user = userEvent.setup()
    // Every request for psychic fails
    server.use(http.get(`${API}/type/psychic`, () => new HttpResponse(null, { status: 500 })))
    await renderTeam(members('deoxys', 'eevee', 'pikachu'))

    expect(await within(analysis()).findByRole('alert')).toBeInTheDocument()
    // The members still show, and can still be changed
    expect(await screen.findByText('#0386')).toBeInTheDocument()
    expect(await screen.findByText('#0133')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove deoxys' }))
    expect(screen.queryByRole('heading', { level: 3, name: 'deoxys' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Removed deoxys from the team.')

    // Without Deoxys, psychic is no longer needed, so the analysis can show
    expect(await findTable()).toBeInTheDocument()
  })

  it('shows an error when a member fails to load; its Retry reloads the member and the analysis', async () => {
    const user = userEvent.setup()
    server.use(http.get(`${API}/pokemon/eevee`, () => new HttpResponse(null, { status: 500 }), { once: true }))
    await renderTeam(members('deoxys', 'eevee'))

    expect(await within(analysis()).findByRole('alert')).toHaveTextContent('Could not load the team analysis.')

    await user.click(within(analysis()).getByRole('button', { name: 'Retry loading the team analysis' }))

    expect(await findTable()).toBeInTheDocument()
    // The member card shares the result, so it loads too
    expect(await screen.findByText('#0133')).toBeInTheDocument()
  })

  it('asks for Pokémon when the team is empty', async () => {
    await renderTeam([])

    expect(within(analysis()).getByText('Add Pokémon to see the analysis.')).toBeInTheDocument()
    expect(within(analysis()).queryByRole('table')).not.toBeInTheDocument()
  })
})
