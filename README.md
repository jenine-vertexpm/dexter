# Dexter

A Pokédex and team builder built with React, TypeScript and Vite, using the public [PokéAPI](https://pokeapi.co/docs/v2).

> **Status:** project scaffolding only. No Pokémon features have been built yet.

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

## Project documents

This project was built for a two-week AI-assisted React engineering challenge; the brief itself is not included in this repository.

- [`docs/DECISIONS.md`](docs/DECISIONS.md) – decision log
