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

## 2026-10-29 - M2 scope: the full brief spec, with later items placed in later milestones
**Context:** Planning M2 (browse and detail). The milestone table gives only a one-line summary of M2, but the brief's detailed sections say much more.
**What I asked the AI:** Plan M2 from the actual repo and brief, in small steps that can be reviewed one at a time.
**What it gave me:** A 12-step plan (`docs/plans/M2.md`) that maps every brief requirement to a milestone.
**What I changed and why:** I decided M2 covers the *full* §2 spec for browse, search/filter, detail and matchups, not just the one-line summary. Other placements:
- **M2:** request timeouts and retrying server errors with backoff (§3.2). The milestone table doesn't place them, and M2 builds the client and data layer they belong to.
- **M2, as "Step 0" PRs:** the "`any` is a lint error" rule and a PR template. Both are brief requirements left over from M1 (oxlint does not flag `any` with our current config, and there is no PR template).
- **M4:** request-budget measurement, route code-splitting, axe checks and end-to-end tests.

TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-29 - Test stack: Vitest, jsdom, React Testing Library, MSW
**Context:** M2 needs green unit and component tests. The repo had no test runner or test script.
**What I asked the AI:** Choose a test stack that works with our actual Vite and React versions, and check compatibility before recommending versions.
**What it gave me:**
- **Vitest** runs the tests and is made for Vite.
- **jsdom** is a fake browser page so components can render in Node.
- **React Testing Library**, user-event and jest-dom let tests render components, act like a user, and check what is on screen.
- **MSW** answers the app's API requests with fake responses, so tests never hit the real PokéAPI.

It found one conflict. jsdom 30 needs Node ≥ 22.22.2, and my local Node is 22.13.1 (CI and Docker are newer). It proposed jsdom 29, which supports Node ^22.13. It also proposed MSW 2.x over the new 3.x because the v2 API is what most documentation describes.
**Verified against:** `npm view <package> version peerDependencies engines` for each package on 2026-10-29; local `node -v`.
**What I changed and why:** Accepted. Upgrading local Node would allow the newest versions instead. TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-29 - Router: React Router v7, declarative mode
**Context:** The brief requires a client-side router with list, detail and not-found routes. The list state lives in the URL.
**What I asked the AI:** Pick a conventional router that supports the routes, query parameters and browser history.
**What it gave me:** React Router in "declarative mode" (`BrowserRouter`, `Routes`, `useParams`, `useSearchParams`, `Link`). It can either replace the current history entry or add a new one, which the search-history rule needs. Its data loaders are not used, because TanStack Query handles data. v8 needs Node ≥ 22.22.0, so v7 (Node ≥ 20) was chosen.
**Verified against:** `npm view react-router@7` and `react-router` (v8) engines and peer dependencies, 2026-10-29.
**What I changed and why:** Accepted. TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-29 - Data fetching: TanStack Query
**Context:** The brief requires caching, retries, cancelling unneeded requests, loading and error states, and never showing results for an older query. API data must also be kept separate from state the user owns.
**What I asked the AI:** Use an established library, TanStack Query if it fits, rather than building our own cache.
**What it gave me:** TanStack Query v5 (works with React 19). The plan:
- **Cancellation:** pass TanStack's `signal` to our client, so requests are cancelled when they become out of date or unused.
- **Retries:** retry network errors, timeouts and 5xx only, never 404 or invalid responses, using TanStack's default backoff.
- **Timeouts:** added in our API client as a new `timeout` error kind.
- **Caching:** set both `staleTime` and `gcTime` to `Infinity`. With only `staleTime` set, the default 5-minute `gcTime` would throw away data for pages you left, and going back would request it again. That breaks the brief's "returning to a page you have already seen makes none".

API data lives in TanStack Query. List state (page, search, types) lives in the URL. Teams come in M3.
**Verified against:** TanStack Query docs, guides "Query Cancellation" (signal aborted when a query *"becomes out-of-date or inactive"*, only if the signal is used) and "Query Retries" (default 3 retries, `retryDelay` `min(1000 * 2 ** attemptIndex, 30000)`). The `staleTime`/`gcTime` defaults and offline ("network mode") behaviour are still to be checked against the docs in plan step S5.
**What I changed and why:** I asked for TanStack Query instead of a hand-written cache, and kept custom code to the retry rule and settings. TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-29 - Search and filter in the browser, over the species index
**Context:** PokéAPI has no search endpoint, and the brief calls this one of the most important decisions. The list must also show each species once, without alternate forms.
**What I asked the AI:** How to do search, type filter and pagination together, with the state in the URL, without wasting requests.
**What it gave me:**
- **The list:** load the species index once (`/pokemon-species?limit=100000`, 1025 names in one request) and do search, type filtering and pagination in the browser. Species are the list entries, so Mega, regional and Gigantamax forms never appear. That is how we tell them apart.
- **Search:** a partial, case-insensitive match on the name.
- **Type filter:** each chosen type is one `/type/{name}` request. Its Pokémon are mapped to species by id. Alternate forms (ids above 10000) are dropped. Two types → only species in both.
- **Cards:** each card loads its Pokémon by id: 1 index request + 20 cards per page.
- **Assumption:** this relies on "species id N = default Pokémon id N". That held for all 1025 species on 2026-10-29, but the docs don't promise it. Safeguards:
  - each card checks that the Pokémon it got belongs to the expected species, and otherwise loads it the documented way (species → default variety);
  - unit tests;
  - a scheduled smoke test in M4.
- **Remaining risk:** the type filter could be wrong if the ids ever stop matching. The smoke test is there to catch that.
**Verified against:** live responses on 2026-10-29: `/pokemon-species?limit=100000` (count 1025), `/pokemon?limit=100000` (1351 entries, 326 with ids above 10000), `/type/fire` (109 Pokémon, 28 of them alternate forms). The docs (pokeapi.co/docs/v2) say `is_default` is *"set for exactly one Pokémon used as the default for each species"*. They do not say the ids match.
**What I changed and why:** Accepted the approach and asked for a safeguard on the id assumption. TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-29 - Type matchups: fixed 18 battle types, current damage relations
**Context:** The detail page must show, for every attacking type, the damage multiplier against this Pokémon, and only types that exist in battle.
**What I asked the AI:** How to interpret "type matchups" from the brief.
**What it gave me:**
- The brief means *defensive* multipliers (0, ¼, ½, 1, 2, 4). We calculate them from the Pokémon's 1–2 types using each type's `damage_relations` (`double_damage_from` ×2, `half_damage_from` ×½, `no_damage_from` ×0), multiplied together for dual types.
- `/type` returns 21 types. `stellar` and `shadow` have no damage relations and no Pokémon, and `unknown` isn't a battle type either.
- It offered two choices: a fixed list of battle types, or working the list out from the data.
**Verified against:** live `/type?limit=100`, `/type/fire`, `/type/stellar`, `/type/shadow` on 2026-10-29. The docs describe `damage_relations` and `past_damage_relations` (older generations).
**What I changed and why:** I chose a fixed list of the 18 battle types and current `damage_relations` only (not `past_damage_relations`). I excluded effects that depend on abilities (e.g. Levitate). Individual Pokémon results are never hardcoded. TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-29 - Search and browser history
**Context:** Search, filter and page live in the URL and must survive reloads and the Back button.
**What I asked the AI:** How the URL history should behave while typing.
**What it gave me:** One option: typing replaces the current history entry, and page and filter changes add new entries.
**What I changed and why:** Chose that. Typing replaces the current URL entry, so Back isn't one step per letter. Page and type-filter changes add an entry, and Back/Forward restore the list state from the URL. The search box reads its value straight from the URL, so there is one source of truth. TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-29 - Detail route takes species names
**Context:** `/pokemon/:name` must work for every species, and evolution-chain entries link to species names.
**What I asked the AI:** What names the detail route should accept.
**What it gave me:** Option to accept species names only, with anything else showing not-found.
**What I changed and why:** Chose species names. Each one is resolved to the species' default variety: `/pokemon-species/{name}`, then the variety with `is_default`, then that Pokémon. So `deoxys` shows `deoxys-normal`. Unknown names (`pikachuu`) and form names (`pikachu-gmax`) show the not-found view. TODO: why, in your own words.
**Verified against:** live status codes on 2026-10-29: `/pokemon/deoxys` 404, `/pokemon/386` 200, `/pokemon-species/deoxys` 200, `/pokemon-species/deoxys-normal` 404, `/pokemon-species/pikachuu` 404.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-29 - PokéAPI data surprises found while planning M2
**Context:** The brief asks for at least three things about the API's data that surprised me, and what I did about each. These were found while checking real responses for the M2 plan.
**What I asked the AI:** Check the API details the plan relies on against the docs and real responses.
**What it gave me:**
1. **A species name is not always a Pokémon name.** *(Observed)* For 37 species, the default Pokémon has a different name: `deoxys` → `deoxys-normal`, `giratina` → `giratina-altered`, `shaymin` → `shaymin-land`. `/pokemon/deoxys` returns 404. *What we do:* the detail route goes species → default variety, and list cards load by id.
2. **Type lists include alternate forms.** *(Observed)* `/type/fire` lists 109 Pokémon, 28 of them alternate forms (ids above 10000). *What we do:* map type members to species and drop forms.
3. **The type list includes types that aren't used in battle.** *(Observed)* `/type` returns 21 types, including `stellar`, `shadow` (empty damage relations, no Pokémon) and `unknown`. *What we do:* use a fixed list of 18 battle types.
4. **Flavour text is raw.** *(Documented: "unprocessed", contains special characters)* Eevee's English text contains `\n` and `\f` line breaks. There are 33 English entries for eevee alone. *What we do:* pick one English entry and clean it in the mapping layer.
5. **Evolution chains are trees, not lines.** *(Documented: `evolves_to` is a list; observed: eevee branches 8 ways)* *What we do:* map to a tree and render branches.
6. **Species id = default Pokémon id is not guaranteed.** *(Observed for all 1025 species, not documented: an assumption)* *What we do:* the safeguards in the search/filter entry above.

**Verified against:** pokeapi.co/docs/v2 and live responses on 2026-10-29 (endpoints listed in `docs/plans/M2.md` §9).
**What I changed and why:** TODO: fill in yourself.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-10-29 - Offline: show an error with retry, not an endless loading state
**Context:** Step S5 (TanStack Query, PR #11). The brief asks for offline to be handled deliberately, and every error state must offer a retry. The plan left the offline behaviour to be decided in S5, after reading TanStack's network-mode docs.
**What I asked the AI:** Set up TanStack Query and decide how offline appears to the user, without leaving an endless spinner.
**What it gave me:**
- **The problem with the default:** TanStack Query's default `networkMode: 'online'` doesn't fail a request while offline; it *pauses* it. A page that has no data yet stays "loading" until the connection comes back, which can be indefinitely.
- **The choice:** `networkMode: 'always'` (in `src/queries/queryClient.ts`). Requests are always attempted. Offline, they fail with our `network` error and the page shows "Could not reach PokéAPI. Check your connection." with a Retry button, the same way as any other failure.
- **No pointless retries:** `shouldRetry` doesn't retry a network error while the browser reports it is offline (`navigator.onLine` is false). Otherwise the user would wait through the retry delays (1 + 2 + 4 seconds) before seeing the message. Network errors while the browser thinks it is online are still retried, because those are often brief.
- **Trade-offs:**
  - Nothing reloads by itself when the connection returns. The user presses Retry. (With `'always'`, TanStack's `refetchOnReconnect` is off, and we turn it off anyway.)
  - `navigator.onLine` can report "online" on a network that has no real internet. Then the normal retries happen first and the error appears after about 7 seconds.
  - Data already loaded stays visible offline, because it is kept for the whole visit.
**Verified against:**
- TanStack Query docs, "Network Mode" guide: in `'online'` mode a query that cannot fetch stays in its state with `fetchStatus: 'paused'`; in `'always'` mode *"your Query will go to `error` state if it fails"*.
- The installed package's type definitions (`@tanstack/query-core` 5.105.0): `networkMode` *"@defaultValue 'online'"*.
- Tests in `src/queries/pokeApiQueries.test.tsx` and `queryClient.test.ts`: offline shows an error immediately, is not paused, and makes one request. Switching back to `'online'` makes that test fail.
**What I changed and why:** Accepted (merged in PR #11). TODO: why, in your own words.
**What I did not understand at first:** TODO: fill in yourself.

## Where AI cost me time

Times the AI sent me down a wrong path: hallucinated APIs, outdated React patterns, code that looked right and was not.

<!-- Add entries here. -->
