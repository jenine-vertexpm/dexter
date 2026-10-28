# CLAUDE.md

## Project

Dexter: a Pokédex and team builder built on the public PokéAPI, for a two-week AI-assisted engineering challenge.

- Stack: React + TypeScript (strict mode) + Vite.
- `react-challenge-brief.md` is the source of truth for requirements and scope. Do not edit it.
- Significant decisions are logged in `docs/DECISIONS.md` using the template in section 4 of the brief. Do not invent entries; the user writes them.

## Commands

- `npm run dev` – dev server
- `npm run typecheck` – type check
- `npm run build` – type check + production build
- `npm run lint` – lint

## Git workflow

- Never commit directly to `main`.
- Each piece of work goes on its own short-lived branch (e.g. `feat/pokemon-list`, `docs/readme`), created from an up-to-date `main`.
- Commit in small, meaningful steps, then push the branch and open a pull request with a description that explains the change.
- Ask me before merging a pull request into `main`.

## Working with me

- I'm a beginner with React. I want to understand every change.
- Keep tasks small: one component, hook or schema at a time.
- Explain what you changed and why in plain English, without jargon (or explain the jargon).
- Stay within the brief's scope. Don't add features that weren't asked for.
