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
| `species-deoxys.json`, `species-eevee.json` | Varieties, evolution chain link, raw flavour text |
| `evolution-chain-1-bulbasaur.json` | Linear chain |
| `evolution-chain-67-eevee.json` | Branches at the first step (8 evolutions) |
| `evolution-chain-18-oddish.json` | Branches at a later step (gloom → vileplume or bellossom) |
| `type-bug.json`, `type-steel.json` | Together give 4× (fire), ¼× (grass) and 0× (poison) against Scizor |
