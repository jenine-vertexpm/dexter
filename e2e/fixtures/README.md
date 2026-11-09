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
| `api/pokemon/390.json`, `737`, `935`, `1025` | 2026-11-07 | The search "char" also finds chimchar, charjabug, charcadet and pecharunt (journey 2) |
| `api/type/fire.json`, `api/type/flying.json` | 2026-11-07 | The two types the filter journey ticks (journey 3) |
| `api/pokemon/146.json`, `250`, `662`, `663`, `741` | 2026-11-07 | The fire + flying Pokémon not already recorded: moltres, ho-oh, fletchinder, talonflame, oricorio (journey 3) |
| `api/pokemon/37.json` … `240` (16 files) | 2026-11-07 | Page 1 of fire-only Pokémon, shown for a moment after ticking "fire" and before "flying" (journey 3) |
| `api/evolution-chain/67.json` | 2026-11-07 | Eevee's chain: branches into 8 evolutions (journey 5) |
| `api/pokemon-species/pikachuu.json` | 2026-11-07 | **404**: a misspelt name must show the not-found page (journey 4) |
| `api/pokemon-species/<name>.json`, `api/pokemon/<name>.json` | 2026-11-07 | bulbasaur, ivysaur, venusaur, charmander, charmeleon, charizard, squirtle, eevee, vaporeon. The detail pages (journeys 4, 5) and team members (journeys 6–8) load a species, then its default Pokémon by name |
| `api/type/normal.json`, `grass`, `poison`, `water` | 2026-11-07 | Type matchups on the detail pages, and the team analysis (journeys 4–8) |

Species files are the largest (about 48 KB each), because they keep every language's flavour text: the schema reads the whole list and the app picks one entry.
