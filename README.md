# Dexter

A Pokédex and team builder built with React, TypeScript and Vite, using the public [PokéAPI](https://pokeapi.co/docs/v2).

> **Status:** M2 (browse and detail) and M3 (teams) are built.
>
> - **Pokémon list:** one entry per species, 20 per page, with search by name and a filter for one or two types. The page, search and types are kept in the URL, so a list view can be reloaded, bookmarked or shared.
> - **Detail page** (`/pokemon/<name>`): artwork, number, types, height and weight, base stats, abilities (hidden ones marked), description, evolution chain, type matchups, and links to the previous and next Pokémon.
> - **Teams** (`/teams` and `/teams/<id>`): build named teams of up to 6 Pokémon, see each team's strengths and weaknesses, and export or import a team as a file. See [Teams](#teams) below.
> - The list, detail and team pages show a loading message while data loads, and an error message with a Retry button if a request fails. On the detail page, the evolution chain and type matchups load separately, so if one fails the rest of the page still shows. The same goes for the analysis on a team page.

## Teams

- **Create, rename and delete teams** on the Teams page. A team name is 1 to 30 characters and must be unique. Names that differ only in capitals or in spaces at the start or end count as the same, so "Rain Team" and " rain team " clash. You have to confirm before a team is deleted.
- **Add Pokémon** from the list or from a Pokémon's page: choose a team in **Add Pokémon to:**, then press the add button. A team holds at most 6 Pokémon, and each species only once.
- **On a team's page** you can remove members, change their order with **Move up** / **Move down**, and give each member an optional nickname: 1 to 12 letters (from any language), numbers and spaces.
- **Team analysis:** for each of the 18 attacking types, how many members are weak to it, resist it, or are immune to it. A type is marked **⚠ Shared weakness** when 3 or more members are weak to it and none resist it or are immune. The analysis also shows the team's average for each base stat.
- **Export team** saves the team as a small `.json` file. **Import a team** (on the Teams page) reads a file like that back and adds it as a new team. Files over 16 KB, files that aren't Dexter team files, files that name a Pokémon species that doesn't exist, and files that break the rules above are rejected with a list of the problems. An import never changes your existing teams. If a team with the same name already exists, the import is rejected: rename or delete that team first.

### Where your teams are saved

Dexter has no server and no accounts. Your teams are saved **only in this browser, on this device**, in its local storage (`localStorage`, under the key `dexter.teams`). In practice:

- **They survive reloads and restarts.** Closing the tab or the browser doesn't delete them.
- **Clearing your browser data for the site deletes them.** Safari may also delete them by itself if you haven't visited the site for 7 days.
- **Private windows don't keep them.** Teams made in a private (incognito) window are deleted when the last private window closes.
- **They don't follow you to another browser or device.** They're also tied to the site's address, so the app opened at a different address or port starts with no teams.
- **If your browser blocks storage**, you can still build teams, but a notice warns that they will be lost when you close the tab.
- **Space is limited** to about 5 MiB per site. A team takes very little of that, but if a save ever fails because storage is full, a notice says so. Your latest change is kept in the open tab but isn't saved, so export your teams to keep a copy.
- **If the saved data is damaged** or was saved by a newer version of Dexter, a notice explains the problem and nothing is changed or overwritten until you choose what to do. You can download a copy of the saved data first. If only some teams are damaged, the others are shown and you can keep them.

**The backup is Export.** To keep a copy of a team, or to move it to another browser or device, export it and import the file there.

### Two open tabs

If Dexter is open in two tabs, a change saved in one tab shows up in the other. There's no merging, though: **the last save wins.**

- If both tabs change teams at nearly the same moment, the later save replaces the earlier one, and the earlier change is lost.
- A half-filled form (for example a nickname you're typing) isn't cleared when the other tab saves. When you submit it, it applies to the updated teams. If the other tab deleted that team, you'll see "This team no longer exists."

### Other limitations

- New team ids are made with the browser's `crypto.randomUUID()`, which only works on secure pages: `https://` addresses and `localhost`. The usual ways of running the app (the commands below, or Docker on `localhost`) are all secure.

## Request budget

PokéAPI is a free public service, so Dexter keeps its requests low ([fair use](https://pokeapi.co/docs/v2#fairuse)). The budget: a cold load of the first list page makes **no more than 25 requests**, and returning to a page already seen makes **none**.

Only requests to `pokeapi.co` count towards it. The artwork comes from GitHub's servers (`raw.githubusercontent.com`), not from PokéAPI, so it is counted separately below.

**Cold and returning visits.**

- **Cold visit:** the app starts with nothing loaded. The first list page loads the species index (one request, used for paging and search) and one Pokémon per card (20).
- **Returning:** everything loaded is kept in the app's memory for the rest of the visit and is never fetched again. Going back to a page, or pressing Back after opening a Pokémon, uses what is already there.
- **Reload or new tab:** that memory is emptied, so a reload or a new tab is a new cold visit.

### Checked automatically

`e2e/request-budget.spec.ts` runs with the other browser tests (`npm run e2e`) on every pull request, against the production container. PokéAPI answers come from recordings (see `e2e/fixtures/README.md`), but the app makes exactly the requests it would make to the live API, so the counts are the same.

| Check | Assertion | Result today |
|---|---|---|
| Cold load of the first list page | at most 25 PokéAPI requests, and none for the same address twice | 21 |
| Page 2, then back to page 1 | no new PokéAPI requests | 0 |
| Open a Pokémon, then Back to the list | no new PokéAPI requests | 0 |

### Measured live

- **Date:** 9 November 2026.
- **Browser:** Chromium 156.0.8078.4 (the version bundled with Playwright), in a 1280×720 window.
- **Set-up:** the production container (`docker compose up --build`, http://localhost:8080) talking to the live PokéAPI and artwork servers.
- **Method:** each request was logged through the Chrome DevTools Protocol, which is where the DevTools Network tab gets its data. The browser cache was disabled, as in DevTools' "Disable cache" option. A Playwright script did the clicking and typing.
- **Repeats:** the measurement was run twice. The first run is shown; the second matched it apart from small differences in bytes. "Transferred" means bytes over the network, including headers, as DevTools reports it.

| | PokéAPI | Artwork | App files (HTML, JS, CSS) | Total |
|---|---|---|---|---|
| **Cold first page:** requests | **21** | 20 | 9 | 50 |
| **Cold first page:** transferred | 144 kB | 3.1 MB | 416 kB | 3.7 MB |
| **Back to page 1** (after page 2): requests | **0** | 0 | 0 | 0 |

- **Artwork is lazy-loaded:** the browser only fetches images that are on screen or about to be, so the artwork count depends on the window size.
- **Back on page 1 there were no artwork requests either,** even with the cache disabled. The browser kept the images it had already shown in memory.

**Typing "pikachu" quickly** into the search box (100 ms between keys), after the first page had loaded. This is for information only; it is not part of the budget.

| | Run 1 | Run 2 |
|---|---|---|
| PokéAPI requests started | 30 | 30 |
| … cancelled | 26 | 15 |
| … completed | 4 | 15 |
| Artwork requests | 4 | 9 |

Each letter updates the results straight away. When a letter changes the list, the cards that disappear stop waiting, and their unfinished requests are cancelled (brief §3.2: requests that are no longer needed are cancelled). How many finish first depends on how fast PokéAPI answers, hence the difference between runs. In both runs the search ended on the one card, pikachu. No change was made: about 30 short requests for a whole word is well within fair use.

## Requirements

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (developed on Node 22)
- npm (comes with Node.js)

## Getting started

Install the dependencies (run once, and again whenever `package.json` changes):

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Then open the address it prints (usually http://localhost:5173) in your browser. The page reloads automatically when you save a file.

## Available commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the local development server |
| `npm run typecheck` | Checks the TypeScript types without building (strict mode) |
| `npm run build` | Type-checks, then builds a production version into `dist/` |
| `npm run preview` | Serves the built `dist/` folder locally to try the production build |
| `npm run lint` | Runs the linter (oxlint) |
| `npm test` | Runs all the tests once (Vitest). Tests use a fake PokéAPI, so they never call the real one |
| `npm run test:watch` | Runs the tests again each time you save a file |

## Project documents

This project was built for a two-week AI-assisted React engineering challenge; the brief itself is not included in this repository.

- [`docs/DECISIONS.md`](docs/DECISIONS.md) – decision log
- [`docs/plans/M2.md`](docs/plans/M2.md) – M2 plan: browse and detail
- [`docs/plans/M3.md`](docs/plans/M3.md) – M3 plan: teams (decisions D8–D18, storage format, team file format and import rules)
