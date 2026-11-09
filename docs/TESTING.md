# Test strategy

This explains how Dexter is tested: what each kind of test checks, why it sits at that level, and what is deliberately **not** tested and why that's acceptable (brief §3.7). Coverage percentages aren't used; the question each test answers is "would this catch the bug?"

Numbers are from `main` on 9 November 2026 (end of M4).

## The levels at a glance

| Level | Tool | What it runs against | How many | When it runs | Blocks a merge? |
|---|---|---|---|---|---|
| **Static checks** | oxlint, TypeScript (`strict`) | the source code | whole codebase | every PR (`lint-and-typecheck`) | yes |
| **Unit tests** | Vitest | plain functions, no browser | 557 tests in 29 files, unit and component together | every PR (`lint-and-typecheck`) | yes |
| **Component tests** | Vitest, jsdom, React Testing Library, MSW | React components with a fake PokéAPI | (included in the 557) | every PR | yes |
| **End-to-end (E2E)** | Playwright (Chromium), axe-core | the **production Docker image**, with **recorded** PokéAPI answers | 28 tests in 7 files | every PR (`image-and-e2e`) | yes |
| **Image and dependency scan** | Trivy | the built image and `package-lock.json` | — | every PR (`image-and-e2e`) | only fixable HIGH/CRITICAL ([policy](vulnerability-triage.md)) |
| **Smoke test** | Vitest (Node) | the **live** PokéAPI | 6 tests | daily at 05:23 UTC, or by hand | **no**, never runs on PRs |

Both CI jobs, `lint-and-typecheck` and `image-and-e2e`, are **required checks** on `main` (branch protection), so a failing test stops the merge.

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
| `browse.spec.ts` | 1 | browse and paginate |
| `list.spec.ts` | 2 | search (in the URL, no-match state); filter by two types, kept after a reload |
| `detail.spec.ts` | 2 | a deep link that survives a reload, plus not-found; a branching evolution chain (eevee, 8 ways) |
| `teams.spec.ts` | 3 | a full team, with the 7th addition rejected; teams surviving a reload; export then import |
| `headers.spec.ts` | 5 | every security header and the exact CSP, on `/`, a deep link, an asset, `/healthz` and a 404 |
| `accessibility.spec.ts` | 12 | axe (WCAG 2.0/2.1 A and AA) on every page and state: list, filters, no results, detail, not-found, teams, delete confirmation, import error, storage notice, team page |
| `request-budget.spec.ts` | 3 | ≤ 25 PokéAPI requests on a cold first page (21 today); 0 when returning to page 1; 0 after a detail page and Back |

These are the brief's eight critical paths (the first four rows), plus headers, accessibility and the request budget.

Two checks run in **every** E2E test, through the shared fixture [`e2e/fixtures.ts`](../e2e/fixtures.ts):

1. **Any CSP violation fails the test.** So all 28 tests also prove the strict CSP doesn't break the app.
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
| **The deployed site** | Dexter isn't deployed until M5 | `headers.spec.ts` takes `E2E_BASE_URL`, ready to run against the deployment in M5 |
| **A coverage percentage** | The brief asks what is tested, not how much; a percentage rewards tests that run code without checking anything | This document |

## Commands

| Command | Runs |
|---|---|
| `npm run lint` / `npm run typecheck` | static checks |
| `npm test` | unit and component tests (never calls the real PokéAPI) |
| `npm run e2e` | E2E tests. Starts the container with `docker compose up --build` if it isn't running. Set `E2E_BASE_URL` to test a different address |
| `npm run e2e:record` | re-records the PokéAPI answers for E2E (live API, by hand only, never in CI) |
| `npm run smoke` | the smoke test against the live PokéAPI |
