# Dexter

A Pokédex and team builder built with React, TypeScript and Vite, using the public [PokéAPI](https://pokeapi.co/docs/v2).

> **Status:** M2 (browse and detail) is complete. The team builder (M3) has not been built yet.
>
> - **Pokémon list:** one entry per species, 20 per page, with search by name and a filter for one or two types. The page, search and types are kept in the URL, so a list view can be reloaded, bookmarked or shared.
> - **Detail page** (`/pokemon/<name>`): artwork, number, types, height and weight, base stats, abilities (hidden ones marked), description, evolution chain, type matchups, and links to the previous and next Pokémon.
> - The list and detail pages show a loading message while data loads, and an error message with a Retry button if a request fails. On the detail page, the evolution chain and type matchups load separately, so if one fails the rest of the page still shows.

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
  - **To do:** six M2 entries still have `TODO` fields to be filled in, in the author's own words (search the file for "TODO").
- [`docs/plans/M2.md`](docs/plans/M2.md) – M2 plan: browse and detail
