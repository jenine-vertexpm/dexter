# Test fixtures

Real PokéAPI responses, fetched on 2026-10-29 and trimmed so tests stay small and readable.

- Only the fields our schemas in `src/api/schemas.ts` read are kept. All values are real.
- `species-*.json`: three English flavour texts and one in another language (out of dozens).
- `type-*.json`: four species plus one alternate form (id above 10000) from the `pokemon` list.
- `species-index.json`: 46 chosen species instead of all 1025, with `count` set to match.

| File | Why it is here |
|---|---|
| `pokemon-386-deoxys-normal.json` | Default Pokémon whose name differs from its species (`deoxys`) |
| `pokemon-212-scizor.json` | Dual type (bug/steel) |
| `pokemon-133-eevee.json` | Has a hidden ability (anticipation). Fetched 2026-11-04. |
| `species-deoxys.json`, `species-eevee.json` | Varieties, evolution chain link, raw flavour text |
| `evolution-chain-1-bulbasaur.json` | Linear chain |
| `evolution-chain-67-eevee.json` | Branches at the first step (8 evolutions) |
| `evolution-chain-18-oddish.json` | Branches at a later step (gloom → vileplume or bellossom) |
| `evolution-chain-202-deoxys.json` | A species that does not evolve (a chain of one). Fetched 2026-11-04. |
| `type-normal.json` | A single type: 2× from fighting, 0× from ghost. Fetched 2026-11-04. |
| `type-bug.json`, `type-steel.json` | Together give 4× (fire), ¼× (grass) and 0× (poison) against Scizor |
| `type-psychic.json` | Deoxys’s type, for the team analysis: 2× from bug, ghost and dark. Fetched 2026-11-06. |

## Team files (`team-files/`)

Hand-made team files for the import tests (M3 plan T10). They also work for trying import by hand.

| File | Expected result |
|---|---|
| `rain-team.json` | Imports: "Rain team" with pikachu (Sparky), eevee, deoxys (Space Rock) |
| `markup-name.json` | Imports: the name `<img src=x onerror=alert(1)>` is shown as text |
| `not-json.json` | Rejected: not valid JSON |
| `newer-version.json` | Rejected: made by a newer version (version 2) |
| `seven-members.json` | Rejected: more than 6 Pokémon |
| `bad-nickname.json` | Rejected: nickname `Sparky!` has punctuation |
| `unknown-species.json` | Rejected: `pikachuu` and `pikachu-gmax` aren't species |
