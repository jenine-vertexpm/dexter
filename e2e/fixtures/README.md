# E2E recordings

Real PokéAPI answers for the Playwright tests (M4 plan §5.2, D20). During `npm run e2e` the browser gets these files instead of calling PokéAPI, so the tests are fast, give the same result every time and never depend on the live API.

- **How they're made:** `npm run e2e:record` runs `e2e/record.ts`. It fetches each URL in its list from the live API, one at a time. It checks each answer with our own zod schemas (`src/api/schemas.ts`), which also drops the fields Dexter doesn't read, and saves the result here. Never run in CI.
- **File format:** `{ "status": 200, "body": { … } }`. A deliberate "not found" is saved as `{ "status": 404, "body": null }`.
- **File names:** the URL path after `/api/v2/` becomes folders, and a query is added with `__`. See `recordingFileFor` in `e2e/recordings.ts`.
  - `/api/v2/pokemon/25` → `api/pokemon/25.json`
  - `/api/v2/pokemon-species?limit=100000` → `api/pokemon-species__limit=100000.json`
- **Missing recording:** any request without a file here fails the test, with a message naming the file it expected. Add the URL to `e2e/record.ts`, run `npm run e2e:record`, and add a row below.
- **Out of date:** if PokéAPI changes, the scheduled smoke test (H9) is the signal. Re-record with `npm run e2e:record`.
- **Artwork:** not recorded. Every image request gets one 1×1 placeholder PNG (in `e2e/fixtures.ts`).

| File(s) | Fetched | Why it is here |
|---|---|---|
| `api/pokemon-species__limit=100000.json` | 2026-11-07 | The full species index (1025 species): the list, search and pagination all run on it |
| `api/pokemon/1.json` … `api/pokemon/40.json` | 2026-11-07 | One Pokémon per card on list pages 1 and 2 (journey 1: browse and paginate) |
