# Test strategy

This explains how Dexter is tested: what each kind of test checks, why it sits at that level, and what is deliberately **not** tested and why that's acceptable (brief §3.7). Coverage percentages aren't used; the question each test answers is "would this catch the bug?"

Numbers are from `main` on 12 November 2026 (M5, after the first automatic deploy).

## The levels at a glance

| Level | Tool | What it runs against | How many | When it runs | Blocks a merge? |
|---|---|---|---|---|---|
| **Static checks** | oxlint, TypeScript (`strict`) | the source code | whole codebase | every PR (`lint-and-typecheck`) | yes |
| **Unit tests** | Vitest | plain functions, no browser | 579 tests in 32 files, unit and component together | every PR (`lint-and-typecheck`) | yes |
| **Component tests** | Vitest, jsdom, React Testing Library, MSW | React components with a fake PokéAPI | (included in the 579) | every PR | yes |
| **End-to-end (E2E)** | Playwright (Chromium), axe-core | the **production Docker image**, with **recorded** PokéAPI answers | 35 tests in 9 files | every PR (`image-and-e2e`) | yes |
| **Image and dependency scan** | Trivy | the built image and `package-lock.json` | — | every PR (`image-and-e2e`) | only fixable HIGH/CRITICAL ([policy](vulnerability-triage.md)) |
| **Smoke test** | Vitest (Node) | the **live** PokéAPI | 6 tests | daily at 05:23 UTC, or by hand | **no**, never runs on PRs |
| **Deployed checks** | Playwright, **requests only** (no browser) | the **live site**, `https://dexter-4tho.onrender.com` | 10 tests in 2 files (`headers.spec.ts`, `runtime-config.spec.ts`) | after every deploy, on pushes to `main` (`deploy` job) | **no**, they run after the merge; a failure turns `main` red |

Both CI jobs, `lint-and-typecheck` and `image-and-e2e`, are **required checks** on `main` (branch protection), so a failing test stops the merge. The deployed checks can't be required checks: they test the site *after* a merge has deployed it.

## What each level tests, and why there

### Static checks: whole classes of bug, before anything runs

- **TypeScript strict mode** catches wrong shapes and missing `null` checks. The API types are generated from the zod schemas, so a schema change shows up as type errors wherever the data is used.
- **oxlint** ([`.oxlintrc.json`](../.oxlintrc.json)) fails on `any` (`typescript/no-explicit-any`), on `dangerouslySetInnerHTML` (`react/no-danger`, see [`SECURITY.md`](../SECURITY.md) A05), and on broken hook rules.

Why here: these are rules about *every* file. A test would only check the files it happens to touch.

### Unit tests: the logic, where the edge cases live

Files: `src/domain/*.test.ts` (12 files), plus `src/api/client.test.ts`, `src/storage/teamStorage.test.ts`, `src/teams/teamsReducer.test.ts`, `src/queries/queryClient.test.ts` and `src/lib/*.test.ts`.

What they cover, matching the brief's list:

| Brief §3.7 asks for | Where |
|---|---|
| type multipliers, dual types, immunities | `matchups.test.ts`, `teamAnalysis.test.ts` |
| team rules (size 6, no duplicate species, unique names) | `team.test.ts`, `teamsReducer.test.ts` |
| nickname validation | `team.test.ts` |
| evolution chain handling (linear, and branching at the first or a later step) | `evolution.test.ts` |
| unit conversion | `units.test.ts` |
| text cleanup (flavour text, names, numbers) | `flavorText.test.ts`, `format.test.ts` |
| storage migration, damaged and newer-version data | `teamStorage.test.ts` |
| import validation, including hostile files | `teamFile.test.ts` |

Also: URL parameters (`listParams.test.ts`), the API client's errors, timeout and retry rules (`client.test.ts`, `queryClient.test.ts`), and the zod `jitless` setting the CSP needs (`zodConfig.test.ts`).

Why here: these rules have many cases (18 × 18 type combinations, every way a file can be wrong). Unit tests run in milliseconds, so every case can be listed. That would be far too slow through a browser.

### Component tests: every state a page can be in

Files: `src/pages/*.test.tsx`, `src/components/*.test.tsx`, `src/queries/pokeApiQueries.test.tsx`, `src/teams/TeamsProvider.test.tsx`, `src/App.test.tsx`.

They render real components in a simulated browser (jsdom), with the network faked by **MSW** ([`src/test/handlers.ts`](../src/test/handlers.ts)). A test can make any request slow, fail with 500, return 404 or return bad data.

- **The loading, empty and error state of every page that fetches data,** and that every error state's Retry button works.
- **The search race (brief §3.1):** `PokemonListPage.test.tsx`, "never shows a result from an earlier search, and cancels its slow request". An older, slower answer is held back until after a newer one, and the test checks it never appears.
- **Caching:** returning to a page already seen makes no new requests; a type already loaded is reused.
- **Team behaviour:** adding, the 6-member limit, reordering, nicknames, the storage notice and its choices, two-tab sync (`TeamsProvider.test.tsx`), and hostile imports shown as text.

Why here: failures such as a 500 on one card, a timeout or a damaged storage value are hard to set up in a real browser, but easy with MSW and a seeded store. Components are where states are shown, so that's where they're checked.

### End-to-end tests: the critical paths, in the real container

Files: `e2e/*.spec.ts`. Run with `npm run e2e`.

Playwright drives a real Chromium against the **production Docker image**: nginx, the built files and the real security headers. That's the same image CI builds.

| Spec | Tests | Checks |
|---|---|---|
| `browse.spec.ts` | 2 | browse and paginate; the footer shows the container's environment name |
| `list.spec.ts` | 2 | search (in the URL, no-match state); filter by two types, kept after a reload |
| `detail.spec.ts` | 2 | a deep link that survives a reload, plus not-found; a branching evolution chain (eevee, 8 ways) |
| `teams.spec.ts` | 3 | a full team, with the 7th addition rejected; teams surviving a reload; export then import |
| `headers.spec.ts` | 5 | every security header and the exact CSP, on `/`, a deep link, an asset, `/healthz` and a 404 |
| `accessibility.spec.ts` | 12 | axe (WCAG 2.0/2.1 A and AA) on every page and state: list, filters, no results, detail, not-found, teams, delete confirmation, import error, storage notice, team page |
| `request-budget.spec.ts` | 3 | ≤ 25 PokéAPI requests on a cold first page (21 today); 0 when returning to page 1; 0 after a detail page and Back |
| `runtime-config.spec.ts` | 5 | requests only: `/config.js` holds exactly the configured values; the CSP's `connect-src` on `/`, `/config.js` and `/healthz` is the configured API; `/healthz` answers without the API |
| `runtime-config-browser.spec.ts` | 1 | in a browser: the app sends its API requests to the configured address and the footer shows the configured environment |

These are the brief's eight critical paths (the first four rows), plus headers, accessibility, the request budget and the runtime configuration.

**One image, many configurations.** CI runs `runtime-config.spec.ts` and `runtime-config-browser.spec.ts` twice against the **same** image: once in the `ci` container, and again in a second container started with a made-up API address and environment name (`demo`). CI then checks that a missing setting, an `http://` address or a value containing `"};alert(1)//` makes the container refuse to start ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml), the "One image" steps).

Two checks run in **every** E2E test that uses the shared fixture [`e2e/fixtures.ts`](../e2e/fixtures.ts) (all except the request-only specs and `runtime-config-browser.spec.ts`, which blocks every outside request and checks for CSP errors itself):

1. **Any CSP violation fails the test.** So every journey also proves the strict CSP doesn't break the app.
2. **Any request to the outside world without a recording fails the test.** This proves CI never touches the live API.

Why here: these are things only a real browser on the real server can show. Routing on a hard reload, headers and the CSP, a file download and upload, data surviving a reload, and the exact number of network requests. They're slower (about 45 seconds for all of them), so only the critical paths are here. The edge cases stay in the faster levels below them.

## Why E2E uses recordings and the smoke test uses the live API

The two answer different questions, so they're split (brief §3.7):

| | E2E tests | Smoke test |
|---|---|---|
| **Question** | "Does *our code* still work?" | "Does *PokéAPI* still behave the way our code expects?" |
| **PokéAPI answers** | recordings in [`e2e/fixtures/api/`](../e2e/fixtures/api/), made by `npm run e2e:record` | the live API |
| **When** | every PR, required | daily, never on PRs, never required |
| **A failure means** | our change broke something, so don't merge | PokéAPI changed or is down: look into it, re-record, maybe adapt |

**Why E2E doesn't use the live API:**
- **Same answer every time.** A test must fail because of *our* change, not because PokéAPI was slow, down, or had added a Pokémon that morning. Flaky tests get ignored, and an ignored test catches nothing.
- **A PokéAPI outage must not block our merges.** Their downtime isn't our bug.
- **Fair use.** Every PR runs 28 tests. Against the live API, each run would send hundreds of requests to a free service for no benefit.
- **The request counts are still real.** The app doesn't know the answers are recorded, so it makes exactly the requests it would make live. The H7 live measurement matched the recorded count (21).

**Why the smoke test does use the live API:** recordings freeze PokéAPI as it was on the day they were made. If PokéAPI changes a field, moves its images or breaks an assumption, the E2E tests would stay green forever. The smoke test ([`smoke/pokeapi.smoke.ts`](../smoke/pokeapi.smoke.ts)) goes through our own client and schemas and checks six things Dexter depends on:
1. the species index still parses, and still has ≥ 1025 species;
2. **assumption A1**, that species id N = Pokémon id N, for every species (never documented by PokéAPI, only observed);
3. eevee's chain still parses and branches 8 ways;
4. types still list alternate forms with ids above 10000, which the filter drops;
5. an unknown name still comes back as not-found;
6. artwork is still on `raw.githubusercontent.com`. If that changes, the CSP's `img-src` must change too.

It runs from [`.github/workflows/smoke.yml`](../.github/workflows/smoke.yml). A failure shows as a red run in the Actions tab, and the smoke-test badge in the README turns red. A GitHub notification also goes to whoever last changed the `cron:` line, by email if their notification setting asks for it. The alarm was tested with a deliberate failure (`force_failure`) in M4 H9, and the email arrived.

**When the smoke test fails:** read which check failed. If PokéAPI changed, adapt the schema or code and re-record with `npm run e2e:record`, so the E2E tests see the new shape too.

## Deployed checks: the live site, after every deploy

A third question needs a third kind of test: "Is *the deployed site* serving what we tested, with the right settings?" CI tests the image, but the live site adds things CI never sees: Render's proxy in front of the container (which could add, drop or change headers), and the production settings from [`render.yaml`](../render.yaml). The brief also asks for the headers to be checked on the deployed site in CI, not by eye (§3.5).

**What runs, and when.** After each merge to `main`, the `deploy` job ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) asks Render to deploy the image just published, waits until the live `/version.txt` names the merged commit, and then runs:

```
npx playwright test e2e/headers.spec.ts e2e/runtime-config.spec.ts
```

with `E2E_BASE_URL` set to the production URL (repository variable `PRODUCTION_URL`), and the expected values `production` and `https://pokeapi.co/api/v2`, the ones in `render.yaml`.

| Spec | Tests | What it checks on the live site |
|---|---|---|
| `headers.spec.ts` | 5 | Every security header, exactly, including **HSTS** (`max-age=31536000`) and the full CSP, on `/`, a deep link (`/pokemon/eevee`), a real `/assets/` file, `/healthz` and a missing file (404). The cache headers. No version number in `Server` |
| `runtime-config.spec.ts` | 5 | `/config.js` holds exactly `production` and the PokéAPI address, and nothing else; `connect-src` is `https://pokeapi.co` on `/`, `/config.js` and `/healthz`; `/healthz` answers `ok` |

**Request-only.** Both specs only send HTTP requests and read the answers (Playwright's `request`). They never open a page, so they never run Dexter's JavaScript, never call PokéAPI, and the `deploy` job doesn't install a browser. This was checked in M5 step R5: both pass with no browser installed. Render adds headers of its own (`server: cloudflare`, `rndr-id`, `cf-*`), and the specs allow those, because they check that Dexter's headers are present and correct, not that nothing else is.

**What a failure means.** The new version is already live: these checks run *after* the deploy, so they can't block it. The run on `main` turns red, the Playwright report is uploaded, and the fix goes through a new pull request. There's no automatic rollback; an earlier deploy can be restored by hand in the Render dashboard. If the deploy itself never goes live (for example the container refuses a bad setting), `/version.txt` never changes, the job fails after 15 minutes, and Render keeps the previous version serving.

**Why the browser journeys don't run against production.** The E2E journeys (browse, search, detail, teams, axe) stay in CI, against the container with recordings:

- **They would use the live PokéAPI.** In production the browser fetches from the real API, so the journeys would become flaky for reasons that aren't ours, and every deploy would send a burst of requests to a free service. The recordings-versus-live split above exists exactly to avoid that, and the daily smoke test already covers "does PokéAPI still behave as we expect".
- **They wouldn't find anything new.** The image is the same one that already passed every journey in CI (same image ID, deployed by digest, `/version.txt` matching). What can differ in production is the **server side**: the proxy, the headers and the settings. That's precisely what the two request-only specs check.
- **The free plan's limits.** Render's free service has 5 GB of outbound bandwidth a month; a full browser suite on every deploy would spend it on tests.

**Running them by hand:** see the command under "Commands" below. The first request may take about a minute if the free service is asleep.

## What isn't tested, and why that's acceptable

| Not tested | Why it's acceptable | What reduces the risk |
|---|---|---|
| **Firefox and Safari** (E2E runs in Chromium only, D19) | The brief names no browsers. Dexter uses only standard web features (`fetch`, `localStorage`, `crypto.randomUUID`). Running three browsers would triple E2E time for little extra confidence. | Standard APIs; component tests aren't tied to a browser engine |
| **Real network slowness and flakiness** | CI uses recordings on purpose (above). Real latency can't be reproduced reliably in a test. | Timeouts, retries and cancellation are unit- and component-tested with MSW delays and errors; the request budget was measured live (README) |
| **Safari deleting `localStorage` after 7 days without a visit** | It's browser policy, and it can't be triggered from a test | Documented in the README; **Export** is the backup; a missing store simply starts empty |
| **Storage really being full, or really blocked** | Hard to cause in a real browser | The notices for both are component-tested by faking the storage error (`StorageNotice.test.tsx`) |
| **Visual layout** (exact look, 360 px width, overlapping elements) | No screenshot comparison: it breaks on every tiny style change and needs constant re-approving | axe checks contrast and structure; the 360 px layout was checked by hand in M2 (M2 plan) |
| **Screen-reader output and how keyboard use feels** | axe finds missing labels and roles, not whether something is *pleasant* to use | Labels and roles are covered by axe and component tests (queries by role and name). A keyboard-only walkthrough was done by hand at the end of M4 (M4 plan §7) |
| **The live PokéAPI in CI** | Deliberate (above) | Daily smoke test |
| **Every Pokémon** (E2E has recordings for about 70 of 1025) | The code path is the same for every Pokémon | Unit tests cover the odd cases (forms, no artwork, branching chains); the smoke test checks A1 for all 1025 |
| **The development server** (`npm run dev`) | It has no security headers or CSP, so E2E against it would hide CSP problems | E2E always runs against the production container (D19) |
| **Unexpected render crashes** | There's no React error boundary yet, so there's nothing to test. It's a known limitation | Listed in [`SECURITY.md`](../SECURITY.md) section 6 |
| **Browser journeys on the deployed site** | They'd depend on the live PokéAPI, and the image is the one that already passed them in CI (see "Deployed checks" above) | The request-only deployed checks (headers, runtime config, health check) run on the live site after every deploy; `/version.txt` proves which commit is live |
| **The `http://` → `https://` redirect** | It's done by Render, not by Dexter's container, so there's nothing of ours to test | HSTS is checked on the live site; the redirect was checked by hand with `curl -I` (SECURITY.md A04) |
| **The health check staying healthy on Render while PokéAPI is down** | Not automated: it means pointing the live service at a broken API address | `/healthz` is answered by nginx alone, and `runtime-config.spec.ts` checks it answers without the API. **The manual check on Render (M5 plan, R7) is still outstanding** |
| **A coverage percentage** | The brief asks what is tested, not how much; a percentage rewards tests that run code without checking anything | This document |

## Commands

| Command | Runs |
|---|---|
| `npm run lint` / `npm run typecheck` | static checks |
| `npm test` | unit and component tests (never calls the real PokéAPI) |
| `npm run e2e` | E2E tests. Starts the container with `docker compose up --build` if it isn't running. Set `E2E_BASE_URL` to test a different address |
| `npm run e2e:record` | re-records the PokéAPI answers for E2E (live API, by hand only, never in CI) |
| `npm run smoke` | the smoke test against the live PokéAPI |
| `E2E_BASE_URL=https://dexter-4tho.onrender.com E2E_EXPECTED_ENVIRONMENT=production npx playwright test e2e/headers.spec.ts e2e/runtime-config.spec.ts` | the deployed checks against the live site (CI runs them after every deploy) |
