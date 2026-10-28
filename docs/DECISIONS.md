# Decision log

One entry per significant decision (not every prompt). Copy the template below for each new entry.

```
## [Date] - [Decision]
**Context:** what I was trying to do
**What I asked the AI:** the substance of the prompt
**What it gave me:** summarised
**What I changed and why:** the important part
**What I did not understand at first:** be honest here
```

## Decisions

<!-- Add entries here, newest at the bottom. -->

## 2026-10-28 - Use zod to validate API responses
**Context:** Building the typed, schema-validated API client for M1. The brief (§3.2) requires every response to be validated at the boundary with a schema library, with TypeScript types generated from the schemas.
**What I asked the AI:** Build the typed, schema-validated client. It offered a choice between zod and valibot.
**What it gave me:** Zod: the most widely used option with the most examples (helpful while learning), at the cost of a larger download (roughly 15-20 KB) than valibot (a few KB). The schema lists only the fields we use; zod drops the rest. The `ApiPokemon` type is generated from the schema with `z.infer`, so the type and the runtime check can't drift apart.
**What I changed and why:** Picked zod (the recommended option); no changes to what the AI built. TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-28 - First API endpoint: one Pokémon by name
**Context:** M1 needs a typed, schema-validated client for one endpoint. I had to pick which one.
**What I asked the AI:** Which endpoint the first client function should cover.
**What it gave me:** Two options: `GET /pokemon/{name}` or the paginated list `GET /pokemon?limit=20&offset=0`. It recommended the single Pokémon: richer data to validate (types, stats, abilities, artwork that can be `null`), a real 404 for unknown names, and both the detail page and the list cards will need it. The list endpoint only returns names and URLs, with no types or artwork.
**Verified against:** Real PokéAPI responses for `eevee`, `pikachuu` (404), `pikachu-gmax`, `koraidon-sprinting-build` and `pecharunt`. They showed that a single Pokémon is a ~249 KB response, height and weight come in decimetres and hectograms, artwork URLs can be `null`, and alternate forms point back to their species (`pikachu-gmax` → `pikachu`).
**What I changed and why:** Picked one Pokémon by name (the recommended option); no changes to what the AI built. TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## Where AI cost me time

Times the AI sent me down a wrong path: hallucinated APIs, outdated React patterns, code that looked right and was not.

<!-- Add entries here. -->
