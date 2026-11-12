# Security

This document explains Dexter's security: what the app is, which security risks apply to it, how each is handled, which risks don't apply and why, and what is still a known limitation. Every claim points at the code, configuration or test that backs it up.

It describes Dexter as it is on `main` in November 2026 (milestone M5): deployed at <https://dexter-4tho.onrender.com> on Render's free plan, from the same Docker image CI builds and tests.

**Risk list used:** the [OWASP Top 10:2025](https://top10.owasp.org/2025/), the current edition. The category names below are copied from the official OWASP site (checked 9 November 2026). (M4 plan, decision D28.)

**Status labels used below**

| Label | Meaning |
|---|---|
| ✅ Handled | The risk applies, and Dexter has protections in place for it |
| ◐ Partly | The risk applies, and the protections only cover part of it |
| ➖ Doesn't apply | The risk needs something Dexter doesn't have (a server, accounts, secrets…) |

## 1. What Dexter is, and where the boundaries are

Dexter is a Pokédex and team builder that runs **entirely in the visitor's browser**.

- **What is served:** static files (HTML, JavaScript, CSS, a favicon), plus three tiny ones: `/config.js` (the runtime configuration, section 7.1), `/version.txt` (the commit the image was built from) and `/healthz` (the health check). They come from nginx in a Docker container ([`Dockerfile`](Dockerfile), [`nginx/default.conf.template`](nginx/default.conf.template)).
- **Where it runs:** a Render free web service, described in [`render.yaml`](render.yaml). Render handles HTTPS in front of the container: it redirects `http://` to `https://` and passes requests on to nginx, which listens on plain HTTP port 8080 inside Render's network.
- **What Dexter doesn't have:**
  - no backend code
  - no database
  - no user accounts, logins, cookies or sessions
  - no secrets in the app or the image: no API keys. The whole project has exactly one secret, the Render deploy hook, which only CI uses (section 7.2). `.env` files are optional, hold only the two non-secret settings ([`.env.example`](.env.example)), and are never committed or copied into the image ([`.dockerignore`](.dockerignore)).
- **The data comes from four places, all treated as untrusted (section 2):**
  1. **PokéAPI** (`https://pokeapi.co`): a free, public, read-only API. Dexter only reads from it, over HTTPS ([`src/api/client.ts`](src/api/client.ts)).
  2. **The artwork host** (`https://raw.githubusercontent.com`): images only.
  3. **The visitor's own browser:** teams are saved in `localStorage` under `dexter.teams` ([`src/storage/teamStorage.ts`](src/storage/teamStorage.ts)). They never leave the device unless the visitor exports a file.
  4. **What the visitor types or picks:** the address bar, forms, and team files they import.

```
            ┌───────────────────────── visitor's browser ─────────────────────────┐
 address ──▶│  Dexter (our JS, from the container)  ◀──▶  localStorage (teams)    │
 bar, forms │        │                    ▲                                        │
 & imports  │        │ GET (read-only)    │ team file (import) / download (export) │
            └────────┼────────────────────┼────────────────────────────────────────┘
                     ▼                    │
               pokeapi.co        raw.githubusercontent.com (images)
```

How a change reaches the live site (section 7, [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```
 merge to main ─▶ GitHub Actions: build once, scan, test ─▶ push to GHCR (public) ─▶ deploy hook (the one secret)
                                                                                         │
 visitors ◀── HTTPS ── Render (pulls that exact image by digest, runs it with production settings) ◀┘
```

**What is worth protecting**, given there's nothing secret on a server:

- **The integrity of the page:** no one else's code should run inside Dexter (injection, section 3 A05).
- **The visitor's teams:** they mustn't be corrupted or lost by bad data (A08, A10).
- **The visitor's privacy towards third parties:** no referrer information is sent, and no tracking is used (section 4).
- **Being a fair user of a free API:** the request budget, in the README.
- **What reaches the live site:** only an image that passed every check in CI should ever be deployed, and only by the pipeline (A08, section 7).

**The container** builds in two stages: the final image holds nginx and the built files only, with no Node, no source and no `node_modules` ([`Dockerfile`](Dockerfile)). It runs as the non-root user 101 (`USER 101`), on port 8080, from the unprivileged nginx base image.

## 2. Untrusted input, and where each kind is checked

Brief §3.5: *"Treat every input as untrusted."* All checking happens before the data is used, and everything is shown through React, which displays text as text, never as HTML (A05).

| Input | Checked by | What happens to bad input | Tests |
|---|---|---|---|
| **PokéAPI responses** | zod schemas in [`src/api/schemas.ts`](src/api/schemas.ts), applied in `getJson` in [`src/api/client.ts`](src/api/client.ts). Fields Dexter doesn't use are dropped. The species list must be complete (`count` must match). | A wrong shape or non-JSON becomes an `invalid-response` error, and the page shows an error with Retry. A 404 becomes `not-found`. Nothing half-valid reaches the components. | [`src/api/client.test.ts`](src/api/client.test.ts) ("throws an invalid-response ApiError when the body does not match the schema", "…a not-found ApiError for a 404") |
| **A Pokémon fetched by number** (the list's shortcut, assumption A1) | `belongsToSpecies` in [`src/domain/pokemon.ts`](src/domain/pokemon.ts), used in [`src/queries/pokeApiQueries.ts`](src/queries/pokeApiQueries.ts) | A mismatched answer is ignored, and the card takes the documented route instead | [`src/pages/PokemonListPage.test.tsx`](src/pages/PokemonListPage.test.tsx) ("falls back to species → default Pokémon when Pokémon N belongs to another species (A1)"); the daily smoke test checks A1 against the live API ([`smoke/pokeapi.smoke.ts`](smoke/pokeapi.smoke.ts)) |
| **List address** (`?q=…&type=…&page=…`) | `parseListParams` in [`src/domain/listParams.ts`](src/domain/listParams.ts): `page` must be a whole number ≥ 1, the search is cut to 50 characters, and types must be among the 18 known ones, at most 2 | An invalid page becomes page 1; unknown or repeated types are dropped; a longer search is cut short | [`src/domain/listParams.test.ts`](src/domain/listParams.test.ts), including "keeps markup-like text as plain text" |
| **Detail address** (`/pokemon/<name>`) | The name is URL-encoded before it's sent to PokéAPI (`encodeURIComponent` in [`src/api/client.ts`](src/api/client.ts)) | An unknown name gets the not-found page | `e2e/detail.spec.ts` (`/pokemon/pikachuu`) |
| **Team address** (`/teams/<id>`) | `teamIdSchema` (must be a UUID) in [`src/domain/team.ts`](src/domain/team.ts), used in [`src/pages/TeamDetailPage.tsx`](src/pages/TeamDetailPage.tsx) | A malformed or unknown id shows the not-found page | [`src/pages/TeamDetailPage.test.tsx`](src/pages/TeamDetailPage.test.tsx) ("shows the not-found page for … a malformed team id") |
| **Saved teams** (`localStorage`) | `loadTeams` in [`src/storage/teamStorage.ts`](src/storage/teamStorage.ts): JSON, then a version number, then the same zod team rules as the forms. A change saved by another tab is checked the same way ([`src/teams/TeamsProvider.tsx`](src/teams/TeamsProvider.tsx)). | Unreadable data, or data from a newer version, is **not used and not overwritten**. Valid teams are salvaged, and a notice offers Download / Keep / Start over ([`src/components/StorageNotice.tsx`](src/components/StorageNotice.tsx)). | [`src/storage/teamStorage.test.ts`](src/storage/teamStorage.test.ts), [`src/components/StorageNotice.test.tsx`](src/components/StorageNotice.test.tsx), `e2e/accessibility.spec.ts` (notice seeded with bad data) |
| **Imported team files** | `parseTeamFile` in [`src/domain/teamFile.ts`](src/domain/teamFile.ts), in order: at most 16 KB; valid JSON (`JSON.parse` only builds plain data, it never runs code); the right format and version; the same team rules as the forms; every species must exist in PokéAPI's species list | Rejected with a list of problems. **An import never changes existing teams;** it only ever adds a new one. | [`src/components/TeamImport.test.tsx`](src/components/TeamImport.test.tsx), section "hostile and invalid files (§3.5)", e.g. a team named `<img src=x onerror=alert(1)>` is shown as text and no image element appears |
| **Runtime configuration** (`DEXTER_API_BASE_URL`, `DEXTER_ENVIRONMENT`) | Twice. When the container starts: strict patterns in [`docker/05-dexter-config.envsh`](docker/05-dexter-config.envsh). In the browser: the same rules in zod, [`src/config.ts`](src/config.ts) (section 7.1) | A missing or invalid value stops the container before nginx serves anything. If `/config.js` is missing or wrong in the browser, the app shows "Dexter isn't configured correctly" instead of a blank page ([`src/components/ConfigProblem.tsx`](src/components/ConfigProblem.tsx)) | CI step "One image, bad config: the container refuses to start" ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)); [`src/config.test.ts`](src/config.test.ts); [`src/components/ConfigProblem.test.tsx`](src/components/ConfigProblem.test.tsx) |
| **Form input** (team names, nicknames) | zod rules in [`src/domain/team.ts`](src/domain/team.ts): names 1–30 characters and unique; nicknames 1–12 letters, numbers and spaces | An inline error message; nothing is saved | [`src/domain/team.test.ts`](src/domain/team.test.ts), e.g. "accepts markup-like text as plain text" |

## 3. OWASP Top 10:2025, category by category

### A01:2025 Broken Access Control — ➖ Doesn't apply

**What it is:** users acting beyond their permissions, e.g. reading someone else's data or calling an admin function. OWASP 2025 also files CSRF and SSRF here.

**Why it doesn't apply to Dexter:**

- There are no users, roles or permissions, and no server-side data or functions to protect. Everything Dexter shows is either public (PokéAPI) or the visitor's own data, in their own browser.
- **CSRF** (another site making your browser send a request "as you"): there is no server that changes anything, and no cookies or logins to ride on.
- **SSRF** (tricking a server into fetching an address of the attacker's choice): Dexter's server only serves its own static files and never fetches anything ([`nginx/default.conf.template`](nginx/default.conf.template)).

The browser itself keeps each site's `localStorage` separate, so other websites can't read Dexter's saved teams. Anyone using the same device can, though (section 6).

**The one permission that does exist is the right to deploy.** Changing what runs on the live site takes either a merge to `main` (branch protection requires CI to pass; only people with write access can merge), the deploy hook (a secret, section 7.2), or access to the Render dashboard. None of these is part of the app.

**Revisit if:** Dexter ever gets accounts or a backend.

### A02:2025 Security Misconfiguration — ✅ Handled

**What it is:** insecure settings, such as missing security headers, default configurations, or a server revealing too much.

**How Dexter handles it:**

- **Security headers on every response, error pages included.** They're set once in [`nginx/security-headers.inc.template`](nginx/security-headers.inc.template) and included in **every** `location` in [`nginx/default.conf.template`](nginx/default.conf.template). In nginx, a header set inside a location would otherwise cancel the shared ones. They're sent with `always`, so a 404 gets them too. Each header is explained in section 4.
- **No version number revealed:** `server_tokens off` makes the server say just `nginx`.
- **A minimal container:** non-root user 101, only the files needed to serve the app, and Alpine's latest security fixes installed at build time (`apk upgrade` in the [`Dockerfile`](Dockerfile)).
- **Correct caching:** fingerprinted assets are cached for a year, and `index.html` is checked every time, so a security fix reaches visitors on their next visit.
- **No silent fallback to default settings.** The image has no default configuration: a missing or invalid setting stops the container instead of starting with a guess (section 7.1).
- **The deployed site is checked, not assumed.** A proxy in front of the container (Render's, here) could add, remove or change headers. So the header test runs against the live site too (below).

**Evidence:**

- [`e2e/headers.spec.ts`](e2e/headers.spec.ts) checks every header, the exact CSP, the hidden version and the cache headers. It covers `/`, a deep link, an `/assets/` file, `/healthz` and a missing file (404). It runs:
  - against the production container, on every pull request (`image-and-e2e`);
  - **against the live site, after every deploy** (the `deploy` job's step "Check the live site's headers and runtime config", with `E2E_BASE_URL` set to the production URL). If a header is missing or different on the live site, the run on `main` turns red.
- Render adds headers of its own (`server: cloudflare`, `x-render-origin-server: nginx`, `rndr-id`, `cf-ray`, `cf-cache-status`). None carries a version number, and the test only requires that `server` has none. Checked with `curl -I` on 2026-11-12.
- During M4 H5, adding `'unsafe-inline'` to the CSP made CI fail (PR #40).

**Limits:** the development server (`npm run dev`) sends none of these headers; only the container does. That's why the E2E tests run against the container (section 6).

### A03:2025 Software Supply Chain Failures — ◐ Partly

**What it is:** harm coming in through what an app is built from: npm packages, base images, CI actions, build tools.

**How Dexter handles it:**

- **Exact, locked versions.**
  - `package-lock.json` is committed, and every install uses `npm ci`, which installs exactly what the lockfile says ([`Dockerfile`](Dockerfile), [`.github/workflows/ci.yml`](.github/workflows/ci.yml), [`.github/workflows/smoke.yml`](.github/workflows/smoke.yml)).
  - Every GitHub Action is pinned to a full commit SHA. The Trivy scanner image is pinned by digest.
- **No third-party code at runtime.** All JavaScript is bundled and served from Dexter's own origin, and the CSP only allows scripts from there (`script-src 'self'`). There are no CDN scripts or analytics. Development tools (Vite, Vitest, Playwright…) never reach the final image (two-stage build).
- **Scanning** (M4 H8):
  - **Trivy** scans the built image and `package-lock.json` (including dev dependencies) on every pull request. It **blocks the merge on HIGH or CRITICAL findings that have a fix**, and lists everything else.
  - **Dependabot alerts and Dependabot security updates** are on, and **Dependabot version updates** run weekly ([`.github/dependabot.yml`](.github/dependabot.yml)).
- **Least privilege in CI:** both workflows default to `permissions: contents: read`. Only the `publish` job is given `packages: write`, which it needs to push the image, and it runs only on pushes to `main`, never for a pull request. Only the `deploy` job reads the deploy-hook secret (section 7.2).
- **The image that is published is the image that was scanned.** Trivy scans the saved image file; `publish` pushes that same file and checks its image ID first (A08).

**Evidence:**

- The CI job `image-and-e2e`, steps "Trivy report" and "Trivy gate".
- In M4 H8 the gate failed on 1 critical and 9 high findings in the nginx base image. After `apk upgrade`, 0 findings remain (PR #43).

**Why only partly:**

- The two base images in the [`Dockerfile`](Dockerfile) are pinned by **version tag**, not by digest. A tag can be republished with different contents.
- `apk upgrade` means two builds on different days can contain slightly different patch versions. Every build is scanned, though.
- The Trivy digest is updated by hand.

All three are listed in section 6.

**Triage policy:** section 5.

### A04:2025 Cryptographic Failures — ➖ Doesn't apply (mostly)

**What it is:** sensitive data that isn't protected by proper encryption, in transit or at rest.

**Why it mostly doesn't apply:**

- Dexter has no passwords, tokens, keys or payment data to encrypt, and it **never asks for personal information**. The only stored data is team names, species and nicknames, in the visitor's own browser.
- Team names and nicknames are free text, though, so a visitor **may choose** to type something personal into them (a real name, for example). That stays in their own browser, unencrypted, and is never sent anywhere by Dexter. See the `localStorage` limitation in section 6.
- Team ids come from `crypto.randomUUID()` ([`src/domain/team.ts`](src/domain/team.ts)). They're unique labels, not secrets, and nothing depends on them being unguessable.

**The part that does apply, transport:**

- PokéAPI and the artwork are only fetched over HTTPS ([`src/api/client.ts`](src/api/client.ts)), and the CSP only allows those `https://` addresses. The configured API address must start with `https://`, or the container won't start (section 7.1).
- **The live site is HTTPS only.** Render serves it over HTTPS with a certificate it manages, and answers a plain `http://` request with a `301` redirect to `https://` (checked with `curl -I` on 2026-11-12; the redirect is Render's, not tested in CI).
- **HSTS is active on the live site.** Every response carries `Strict-Transport-Security: max-age=31536000`, so once a browser has visited, it uses only HTTPS for Dexter for a year, without even trying `http://`. This is checked on the live site after every deploy by `headers.spec.ts` (A02). Locally (`http://localhost`), browsers ignore it.
- **What HSTS can't do:** protect a visitor's very first visit, if they type `http://`. That first request relies on Render's redirect. Closing that gap needs the HSTS preload list, which requires `includeSubDomains` across a domain you own; Dexter runs on Render's `onrender.com`, so that isn't possible (section 6).

**Revisit if:** Dexter ever stores anything sensitive.

### A05:2025 Injection — ✅ Handled

**What it is:** untrusted data being run as code or commands. For a browser app, that mainly means **cross-site scripting (XSS)**: someone getting their script to run inside Dexter's page. SQL, command and LDAP injection need a database, shell or directory on a server, and Dexter has none.

**How Dexter handles XSS, in layers:**

1. **React shows data as text.** A team named `<img src=x onerror=alert(1)>` is displayed as those characters, never as an image element.
2. **No way around that.**
   - `dangerouslySetInnerHTML` is banned by the lint rule `react/no-danger` ([`.oxlintrc.json`](.oxlintrc.json)), which fails CI.
   - There is no `innerHTML`, `eval` or `new Function` in `src/`.
3. **The CSP is a safety net if markup ever got in.** `script-src 'self'` has no `'unsafe-inline'` and no `'unsafe-eval'`. So if an attacker's markup did reach the page, the browser would refuse to run an inline `<script>` block, an event-handler attribute such as `onerror="…"`, a `javascript:` link, or code built from text with `eval`; and it would refuse to load a script from any other site. zod is set to `jitless`, so Dexter itself never needs `eval` ([`src/lib/zodConfig.ts`](src/lib/zodConfig.ts)).

   **What the CSP does not do:** it doesn't prevent every XSS bug. It only allows or blocks *where code and data come from*. It can't stop a bug in Dexter's own JavaScript from misusing data, and it can't stop markup being injected in the first place (it limits what that markup can do). That's why layers 1 and 2 come first, and the CSP is the backstop.
4. **The runtime configuration can't inject code.** `/config.js` is generated when the container starts, from two settings. They're limited to characters that can't break out of the JavaScript string they're placed in, and checked again by the app (section 7.1).
5. **Values placed in addresses are encoded.** Names are URL-encoded before they're sent to PokéAPI ([`src/api/client.ts`](src/api/client.ts)). An export's file name is reduced to letters, numbers and dashes (`teamFileName` in [`src/domain/teamFile.ts`](src/domain/teamFile.ts)).

**Evidence:**

- [`src/components/TeamImport.test.tsx`](src/components/TeamImport.test.tsx): "imports a name containing markup, and shows it as text: no img element appears".
- [`src/domain/listParams.test.ts`](src/domain/listParams.test.ts) and [`src/domain/team.test.ts`](src/domain/team.test.ts): markup kept as text.
- [`e2e/headers.spec.ts`](e2e/headers.spec.ts): the CSP has no `unsafe-inline` or `unsafe-eval`.
- [`e2e/fixtures.ts`](e2e/fixtures.ts): **every** E2E test fails on any CSP violation, so all the journeys prove the app runs under the strict policy.
- CI starts the image with `DEXTER_ENVIRONMENT=ci"};alert(1)//`, a value written to break out of `/config.js`, and checks that the container refuses to start (step "One image, bad config"). [`src/config.test.ts`](src/config.test.ts) checks that the app's own zod rules reject quotes, `javascript:` and `http://` values too.

### A06:2025 Insecure Design — ✅ Handled

**What it is:** weaknesses in the design itself, which careful coding can't fix afterwards.

**Design choices in Dexter that limit harm** (most are recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md) or the plans):

- **One set of rules for every way teams come in.** Forms, saved data and imported files all use the same zod rules ([`src/domain/team.ts`](src/domain/team.ts)), so no route in is weaker than the others.
- **Saved data is never overwritten by mistake.** If it can't be read, nothing is saved until the visitor chooses. "Download saved data" is always offered first ([`src/components/StorageNotice.tsx`](src/components/StorageNotice.tsx)).
- **Imports only add.** They never replace or change existing teams.
- **Limits everywhere:**

  | What | Limit |
  |---|---|
  | Team size | 6 |
  | Team name | 30 characters |
  | Nickname | 12 characters |
  | Search | 50 characters |
  | Type filters | 2 |
  | Team file | 16 KB |

- **Deleting needs a confirmation.**
- **Being a fair user of a third-party API:**
  - data is cached for the whole visit;
  - requests that are no longer needed are cancelled;
  - a first page load makes 21 requests, under the budget of 25 (README "Request budget", [`e2e/request-budget.spec.ts`](e2e/request-budget.spec.ts)).
- **Undocumented API behaviour is guarded.** The list relies on an observed shortcut (A1: species number = Pokémon number). It has a runtime check and fallback, and a daily check against the live API.
- **This document** is the threat model: section 1 lists what's worth protecting and where the boundaries are.

### A07:2025 Authentication Failures — ➖ Doesn't apply

**What it is:** weaknesses in proving who someone is: logins, passwords, sessions, tokens.

**Why it doesn't apply:** Dexter has no accounts, no login, no passwords, no sessions and no cookies. Every visitor sees the same public data and their own local teams.

**Revisit if:** accounts or any server-side storage are added.

### A08:2025 Software or Data Integrity Failures — ✅ Handled

**What it is:** trusting code or data without checking that it is what it claims to be, e.g. unsafe deserialisation, unverified updates, or a weak build pipeline.

**Data integrity:**

- **All data from outside is checked before use** (section 2): API answers, saved data and imported files.
- **Formats are versioned.** Saved data carries `version` ([`src/storage/teamStorage.ts`](src/storage/teamStorage.ts)), and team files carry `format` and `version` ([`src/domain/teamFile.ts`](src/domain/teamFile.ts)).
- **Data from a newer version of Dexter is neither guessed at nor overwritten.**
- **Only plain data is read.** `JSON.parse` builds plain data; there is no deserialisation that could create objects with behaviour.

**Code integrity:**

- **Scripts come only from Dexter's own origin** (`script-src 'self'`).
- **Images from GitHub can't run code,** and the CSP limits them to that one host.
- **Subresource Integrity (SRI) isn't needed:** it protects scripts loaded from someone else's server, and Dexter loads none.

**Pipeline integrity:**

- Actions are pinned by SHA, and the Trivy image by digest.
- CI has read-only permissions.
- Dependabot PRs go through the full CI and are merged by a person. Nothing merges automatically.

**Deployment integrity: the image that was tested is the image that runs** (brief §3.6, [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

1. `image-and-e2e` builds the image **once**, saves it to a file, scans that file with Trivy and runs every E2E test against it.
2. `publish` loads that same file (no rebuild), checks its image ID matches the tested one, pushes it to GHCR, pulls it back by digest and checks it starts.
3. `deploy` tells Render to deploy it **by digest** (`…@sha256:…`), not by tag. A tag such as `main` can be moved to another image; a digest is the fingerprint of one exact image, so it can't.
4. `deploy` then waits until the live `/version.txt` names this commit, and runs the deployed checks (section 7).

Render pulls the image itself; nothing is built or changed on the way.

**Remaining exposure:**

- The base images are pinned by tag, not digest (A03, section 6).
- Anyone holding the deploy hook could start a deploy. Render only accepts images from Dexter's own GHCR path, so the worst case is redeploying an older Dexter image, not running someone else's code (section 7.2).

### A09:2025 Security Logging and Alerting Failures — ◐ Partly

**What it is:** not noticing or recording security-relevant events, so problems go undetected.

**What Dexter has:**

- **Alerts about the code and its dependencies:**
  - CI fails on lint, type, test, E2E, header or CSP problems, and on fixable serious vulnerabilities (Trivy).
  - Dependabot alerts.
  - A **daily smoke test** against the live PokéAPI ([`.github/workflows/smoke.yml`](.github/workflows/smoke.yml)), whose failure shows red in the Actions tab and sends a GitHub notification. The alarm was tested with a deliberate failure in M4 H9.
- **Deploy alerts:** if a deploy fails, or the live site's headers or configuration are wrong after a deploy, the `deploy` job fails and the run on `main` turns red.
- **Server logs:** nginx writes access and error logs to the container's output; the health check is excluded (`access_log off` in [`nginx/default.conf.template`](nginx/default.conf.template)). On the live site, those logs, and the start-up messages (including a configuration error), are read in the **Render dashboard**, on the service's **Logs** page (section 7.4). Render keeps them for **7 days** on the Hobby plan.

**Why only partly:**

- With no server-side users or actions, there are no security events about users to record. That part of the category has little to apply to.
- Dexter has **no error reporting from visitors' browsers**. That's deliberate: it would mean sending data to a third party and widening `connect-src`.
- The logs are **kept, not watched.** Nothing alerts on what's in them, and nothing copies them anywhere before Render deletes them after 7 days. That's accepted for a static site with no users or server-side actions; a log stream to another service would be the next step if that changed.
- There is no uptime monitoring between deploys (out of scope, M5 plan §11).

### A10:2025 Mishandling of Exceptional Conditions — ◐ Partly

**What it is:** not anticipating or handling errors and unusual situations, e.g. failing "open" into an unsafe state, or crashing.

**How Dexter handles it:**

- **Requests can't hang.** Every request is cancelled after 10 seconds (`REQUEST_TIMEOUT_MS` in [`src/api/client.ts`](src/api/client.ts)).
- **Errors are sorted into kinds:** `not-found`, `http`, `network`, `timeout` or `invalid-response`.
- **Retries are deliberate** (`shouldRetry` in [`src/queries/queryClient.ts`](src/queries/queryClient.ts)):
  - server errors, timeouts and network errors are retried, at most 3 times, with backoff;
  - a 404 or an invalid answer is never retried.
- **Every error state has a message and a Retry button,** including when offline. On the detail and team pages, one failing part doesn't take down the rest.
- **Storage fails closed:**
  - unreadable or newer-version data pauses saving until the visitor chooses;
  - blocked storage and a full storage each get their own notice;
  - the app still works ([`src/components/StorageNotice.tsx`](src/components/StorageNotice.tsx)).
- **Bad configuration fails closed** (section 7.1):
  - a missing or invalid setting stops the container before it serves anything;
  - on Render, a new deploy that never becomes healthy doesn't replace the one already running, so visitors keep getting the previous version (Render docs, *Deploys*; this is Render's documented behaviour, not something CI tests);
  - if `/config.js` doesn't load or is wrong in the browser, the app shows "Dexter isn't configured correctly" rather than a blank page.
- **The health check doesn't depend on PokéAPI.** `/healthz` is answered by nginx itself, so Render won't restart or take down Dexter because PokéAPI is down. When PokéAPI is down, the app shows its own error states with Retry.

**Evidence:**

- [`src/api/client.test.ts`](src/api/client.test.ts) (timeouts, 404, invalid responses).
- [`src/components/StorageNotice.test.tsx`](src/components/StorageNotice.test.tsx) (every storage state).
- [`src/storage/teamStorage.test.ts`](src/storage/teamStorage.test.ts).
- CI step "One image, bad config: the container refuses to start"; [`src/config.test.ts`](src/config.test.ts); [`src/components/ConfigProblem.test.tsx`](src/components/ConfigProblem.test.tsx).
- [`e2e/runtime-config.spec.ts`](e2e/runtime-config.spec.ts): `/healthz` answers `ok` without using the API, in CI (where the second container's API address doesn't exist) and on the live site.
- **Not yet shown on Render:** the M5 plan's "PokéAPI-down check" (point the live service at an unreachable API and confirm it stays healthy) is still outstanding (M5 plan §7, R7).

**Why only partly:** there is **no React error boundary**. An unexpected bug while drawing a page, or a page's code failing to download, leaves a **blank page** with no message. This was seen once during M4 testing, when a network change interrupted a page's code download. Section 6 has the details.

## 4. Security headers

They're set in [`nginx/security-headers.inc.template`](nginx/security-headers.inc.template) and checked by [`e2e/headers.spec.ts`](e2e/headers.spec.ts), on the container for every pull request and on the live site after every deploy. You can see them yourself with `curl -I https://dexter-4tho.onrender.com/` (or `curl -I http://localhost:8080/` locally).

| Header | Value | What it does |
|---|---|---|
| `Content-Security-Policy` | see below | Lists the only places the page may load anything from, and forbids inline scripts, event-handler attributes and `eval`. A second line of defence against XSS, not a replacement for showing data as text (A05). |
| `Strict-Transport-Security` | `max-age=31536000` | Once a browser has seen Dexter over HTTPS, it uses only HTTPS for it for a year. **Active on the live site** and checked there after every deploy (A04). Ignored over plain `http://localhost`. No `includeSubDomains` or `preload`: we don't own the parent domain, `onrender.com`. |
| `X-Content-Type-Options` | `nosniff` | The browser must trust the file type the server sends rather than guess from the contents, so a file can't be passed off as a script. |
| `X-Frame-Options` | `DENY` | Older browsers' way of saying "never show this site inside a frame" (against clickjacking). |
| `Referrer-Policy` | `no-referrer` | When Dexter loads data or images, the browser doesn't tell PokéAPI or GitHub which page the visitor was on. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Switches off powerful browser features Dexter never uses, so nothing in the page can ask for them. |

**The Content Security Policy, rule by rule**

| Rule | Allows | Why |
|---|---|---|
| `default-src 'none'` | nothing, unless a rule below says otherwise | Start from "block everything" |
| `script-src 'self'` | only Dexter's own JavaScript files | Injected inline `<script>` blocks, event handlers (`onerror=…`), `javascript:` links and `eval` are refused, and scripts from other sites can't load |
| `style-src 'self'` | only Dexter's own CSS files | The stat bars set their width through JavaScript, which this allows |
| `img-src 'self' https://raw.githubusercontent.com` | the favicon and the official artwork | The daily smoke test warns if PokéAPI moves its artwork elsewhere |
| `connect-src https://pokeapi.co` | data requests to PokéAPI only | Dexter's code can't send data to any other address with `fetch`, which also limits what a bug could leak. The address is the configured API's origin, filled in when the container starts (section 7.1); in production and locally it is `https://pokeapi.co` |
| `base-uri 'none'` | no `<base>` tag | Stops relative links being redirected |
| `form-action 'none'` | no form submitting to any address | Dexter's forms are handled in JavaScript and never submit |
| `frame-ancestors 'none'` | no site may frame Dexter | Against clickjacking |

## 5. Dependencies and how findings are triaged

How vulnerabilities are found and handled is set out in full in [`docs/vulnerability-triage.md`](docs/vulnerability-triage.md), which stays the **single source of truth** for the policy. (The M4 plan said the policy would move into this file. It deliberately stays where it is: the CI and Dependabot files point to it, and keeping one full copy means the two can't drift apart.) In short:

- **Found by:**
  - Trivy, in CI on every pull request (the image and `package-lock.json`);
  - Dependabot alerts and security updates;
  - weekly Dependabot version updates.
- **Severity and fix decide what happens:**
  - a **HIGH or CRITICAL finding with a fix blocks the merge** and is fixed by updating;
  - everything else is reported and picked up by regular updates;
  - unfixable findings are checked for whether Dexter is actually affected.
- **Exceptions** go in `.trivyignore`:
  - one line per CVE, with a written reason;
  - an `exp:` date, after which Trivy reports the finding again.
  
  There are none today.
- **Dependabot PRs** go through the full CI and a human review:
  - security updates first;
  - grouped minor and patch updates when green;
  - each major update after reading its release notes;
  - an unwanted update is closed with a written reason.

## 6. Known limitations

| Limitation | Why it matters | What limits the risk today | Status |
|---|---|---|---|
| **No React error boundary** | An unexpected render bug, or a failed download of a page's code, leaves a blank page with no message (A10) | Rare. Known API and storage failures all have error states. Reloading fixes a failed download. | Open. Out of M4 scope (M4 plan §11); a small change if wanted. |
| **`localStorage` is readable by anyone with access to the device, and by any script running on Dexter's origin** | Saved teams aren't private or encrypted | Dexter never asks for personal information; teams hold only team names, species and nicknames. But those are free text, so a visitor may type something personal into them, and anyone using the same device could read it. The data never leaves the device unless the visitor exports a file. The CSP allows only Dexter's own scripts. | Accepted |
| **The development server has no CSP or security headers** | A change that breaks the CSP isn't visible in `npm run dev` | The E2E tests run against the production container, with the real headers, on every PR | Accepted (M4 plan D21) |
| **HSTS can't protect a first visit over `http://`** | Before a browser has seen the HSTS header once, a typed `http://` address is sent unencrypted until Render redirects it | Render redirects every `http://` request to `https://`; after that first visit the browser never tries `http://` again for a year. Preloading isn't possible on `onrender.com` (A04) | Accepted |
| **The deployed checks run after the deploy, not before** | If the live site's headers or configuration came out wrong, visitors would already be getting that version | The same checks pass against the same image in CI before it's published; a failure turns `main` red at once. There's no automatic rollback: an earlier deploy can be restored by hand in the Render dashboard | Accepted (M5 plan D36) |
| **`/config.js` is code generated when the container starts** | Settings written into a script could, in principle, carry injected code | Strict character rules at start-up and again in the app; a bad value stops the container (section 7.1). Only people who can already change the deployment can set the values | Handled |
| **The deploy hook is a repository secret, not a GitHub Environment secret** | A workflow started by a pull request from a branch **in this repository** (never from a fork) could read it | Only people with write access can push branches here, and they could already change the workflow itself. A leaked hook can only redeploy Dexter's own images (section 7.2) | Accepted ([M5 plan](docs/plans/M5.md) D37) |
| **The container image is public** | Anyone can download it and see exactly what the site serves | Everything in it is already public (the repository and the site itself); it holds no secrets or settings (section 7.3) | Accepted (M5 plan D31) |
| **"The health check doesn't depend on PokéAPI" isn't yet shown on Render** | Brief §3.4 asks for this to hold on the deployment platform | Shown by the nginx config and in CI (A10) | Open: the M5 plan's PokéAPI-down check (R7) is outstanding |
| **Base images are pinned by tag, not digest** | A tag can be republished with different contents | Trivy scans every built image; Dependabot proposes updates | Open (A03) |
| **`apk upgrade` makes builds not exactly reproducible** | Two builds on different days can contain slightly different patch versions | Every build is scanned | Accepted in M4 H8 (PR #43) |
| **The Trivy image digest is updated by hand** | Dependabot can't update a digest inside a `docker run` command | The procedure is in [`docs/vulnerability-triage.md`](docs/vulnerability-triage.md) | Accepted |
| **No error reporting from visitors' browsers; server logs are kept only 7 days and not watched** | Problems in real use would only be noticed if reported, and older logs are gone (A09) | CI, Trivy, Dependabot, the daily smoke test and the deployed checks cover the code, its dependencies and each deploy. Recent logs are in the Render dashboard (section 7.4) | Accepted. Browser error reporting: not planned. |
| **The daily smoke test pauses itself** after 60 days without repository activity (a GitHub rule for public repositories) | The early warning would stop silently | One click in the Actions tab re-enables it | Accepted |

## 7. The deployed service

How the parts added in M5 (runtime configuration, the deploy secret, the public image and the logs) are kept safe.

### 7.1 Runtime configuration, and why `/config.js` can't inject code

**What it is.** The same image runs locally, in CI and in production (brief §3.4). The two settings that differ, the API's address and the environment's name, are environment variables read when the container **starts**: `DEXTER_API_BASE_URL` and `DEXTER_ENVIRONMENT`. In production they're set in [`render.yaml`](render.yaml) (`https://pokeapi.co/api/v2` and `production`).

**How they're used** ([M5 plan](docs/plans/M5.md) D32, §6.1):

1. [`docker/05-dexter-config.envsh`](docker/05-dexter-config.envsh) checks both values when the container starts and works out the API's origin (`https://pokeapi.co`).
2. nginx's start-up step fills them into two templates: a one-line `/config.js`, `window.__DEXTER_CONFIG__={"apiBaseUrl":"…","environment":"…"};` ([`nginx/default.conf.template`](nginx/default.conf.template)), and the CSP's `connect-src` ([`nginx/security-headers.inc.template`](nginx/security-headers.inc.template)). Only variables whose names start with `DEXTER_` are filled in (`NGINX_ENVSUBST_FILTER` in the [`Dockerfile`](Dockerfile)).
3. `index.html` loads `/config.js` as an ordinary script file from Dexter's own site, which `script-src 'self'` allows. No inline script, so the CSP is unchanged.
4. The app checks the values again with zod before using them ([`src/config.ts`](src/config.ts)).

**The rules** (the same in the start-up script and in `src/config.ts`):

| Setting | Must match | In words |
|---|---|---|
| `DEXTER_API_BASE_URL` | `^https://[a-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$`, no trailing slash | `https://` only; a lower-case host; an optional port; a path of letters, digits and `. _ ~ / -` |
| `DEXTER_ENVIRONMENT` | `^[a-z][a-z0-9-]{0,19}$` | 1 to 20 lower-case letters, digits or dashes, starting with a letter |

Each value must also be a single line. A missing or non-matching value prints `Dexter configuration error: …` and stops the container.

**Why that makes injection impossible.** To turn a setting into code, a value would have to *end* the text it's placed in and start something new. In `/config.js` that means a `"` (to close the JavaScript string), plus characters such as `;`, `(`, `)` or `}`. In nginx's configuration it means a `'`, `;` or `$`; in the CSP header a `;` or a space. **None of those characters is allowed**, and neither are `<`, `>`, `\` or line breaks. Whatever value passes the rules can only ever be an address or a name inside a string. A `javascript:` or `http://` address fails too, because it must start with `https://`.

**Who could set a value at all:** only someone who can already change the deployment (the Render dashboard, or `render.yaml` through a reviewed pull request and a Manual Sync). So the rules mainly guard against **mistakes**, such as a typo or a stray quote, turning into a broken or unsafe site; an attacker who could set them could already deploy anything.

**Evidence:** the CI step "One image, bad config: the container refuses to start" starts the image with a missing setting, an `http://` address and `DEXTER_ENVIRONMENT=ci"};alert(1)//`, and checks each one is refused. [`src/config.test.ts`](src/config.test.ts) checks the app rejects quotes, `javascript:`, `http://`, a trailing slash and over-long names. [`e2e/runtime-config.spec.ts`](e2e/runtime-config.spec.ts) checks `/config.js` contains exactly the configured values and nothing else, and that `connect-src` follows the configured API, in CI with two different configurations of the same image, and on the live site after every deploy.

**What it doesn't change:** `img-src` isn't configurable. Artwork addresses come from PokéAPI's data and point at `raw.githubusercontent.com`; the daily smoke test watches for that changing.

### 7.2 The one secret: `RENDER_DEPLOY_HOOK`

**What it is.** Render gives each service a **deploy hook**: a private URL that starts a deploy when it's called. Whoever has the URL can start a deploy, so it's a secret. It's stored as the **repository secret** `RENDER_DEPLOY_HOOK` in GitHub (Settings → Secrets and variables → Actions), as brief §3.5 asks. It's the only secret Dexter has: no Render API key, no registry password (publishing uses the workflow's own short-lived `GITHUB_TOKEN`). The site's address is the repository **variable** `PRODUCTION_URL`, because it isn't secret.

**How it's protected** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml), job `deploy`):

- Only the `deploy` job reads it, and that job runs only on pushes to `main`, after `publish` has passed.
- GitHub hides the secret's value in logs. The job also hides the key part of the URL on its own (`::add-mask::`) and never prints the URL.
- GitHub never gives repository secrets to workflows started by pull requests **from forks**. A pull request from a branch **in this repository** could read it. Only people with write access can push branches here, and they could already change the workflow itself ([M5 plan](docs/plans/M5.md) D37).
- It has never been committed: `git log -p --all | grep -cE 'api\.render\.com/deploy/srv-'` finds nothing (checked 2026-11-12). The backslashes stop the command from matching its own text.

**If it leaked:** someone could make Render redeploy. The deploy call names an image, and Render rejects any image that isn't from Dexter's own path (`ghcr.io/jenine-vertexpm/dexter`), so the worst case is that an older Dexter image is put back live. It can't run someone else's code or expose any data. That older image was itself tested in CI when it was published.

**How to rotate it** (if it's ever seen in a log, a commit, a screenshot or a message, or as routine):

1. Render dashboard → the `dexter` service → **Settings** → **Deploy Hook** → **Regenerate Hook**. The old URL stops working straight away.
2. Copy the new URL. Don't paste it into a commit, an issue, a chat or the terminal history.
3. GitHub → the repository → **Settings** → **Secrets and variables** → **Actions** → `RENDER_DEPLOY_HOOK` → **Update secret**, paste, save.
4. Check it works: re-run the `deploy` job of the latest run on `main` (Actions tab). It redeploys the same image, and fails with HTTP 404 if the secret is still the old URL.
5. If the old URL ever reached a commit, rotating isn't enough on its own: brief §3.5 also asks for a write-up of what happened, in the decision log.

### 7.3 The public image on GitHub Container Registry

The image is published to `ghcr.io/jenine-vertexpm/dexter` as a **public** package, so Render can pull it without credentials (M5 plan D31).

**What "public" means:** anyone can download (pull) the image without signing in. GitHub's docs: public container packages *"allow anonymous access and can be pulled without authentication"*, and *"once you make a package public, you cannot make it private again"* (GitHub Docs, *Configuring a package's access control and visibility*, checked 2026-11-12). An anonymous pull of `:main` works (checked 2026-11-12).

**Only the repository can push to it:** pulling is open, pushing isn't. Only the `publish` job pushes, with the workflow's own `GITHUB_TOKEN` and `packages: write`, on pushes to `main`.

**Why public is acceptable:**

- It contains nothing that isn't already public: the built app (which every visitor downloads anyway), nginx's configuration templates and the start-up script (all in this public repository), and `/version.txt`.
- It contains **no secrets and no settings**. The configuration is supplied when the container starts, and there's no `config.js` in the image (only templates). `.env` files are kept out of the build by [`.dockerignore`](.dockerignore).
- Anyone could already build the identical image from the public repository.

**What it does reveal:** the exact base image and package versions, which can help someone look up known vulnerabilities. That's equally visible from the public `Dockerfile` and lockfile. The answer is keeping them patched (A03, section 5), not hiding them.

### 7.4 Logs

**Where they are:** Render dashboard → the `dexter` service → **Logs** (Render docs, *Logs in the Render Dashboard*). They hold what the container prints: nginx's access and error logs, and the start-up messages, including `Dexter configuration: environment=… api=…` or a `Dexter configuration error`. Each deploy's own log can also be opened from the service's list of deploys. Only people with access to the Render workspace can see them.

**How long they're kept:** Render's retention depends on the workspace plan: **Hobby 7 days**, Pro 14 days, Scale/Enterprise 30 days. Older logs are gone and can't be recovered, even by upgrading (Render docs, *Logs in the Render Dashboard*, "Retention period", checked 2026-11-12). Dexter's workspace is on the Hobby plan (M5 plan D30), so **7 days**.

**What they contain:** an access-log line for each request to Dexter's own site: the address requested, the status, the browser and the network addresses nginx sees. Teams and PokéAPI requests never reach Dexter's server, so they're never in these logs. Moving around inside the app doesn't reach the server either. Only when a page is opened or reloaded from an address (for example a shared link with `/?q=eevee&type=water`) does that address appear in the log, and those hold only Pokémon names, types, page numbers or a team's random id (never its contents). The health check isn't logged.

**What's missing:** nothing reads them automatically, and nothing copies them elsewhere (A09, section 6).

## 8. Reporting a vulnerability

Please report security problems **privately**, not in a public issue. Dexter uses GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability). You need to be signed in to GitHub.

1. Go to the repository's main page on GitHub.
2. Under the repository name, click the **Security and quality** tab. If you can't see it, open the **⋯** menu and choose **Security and quality** there.
3. Click **Report a vulnerability**.
4. Fill in the form: a summary, the details, how to reproduce it (proof of concept), and what an attacker could do with it (impact).
5. Click **Submit report**.

The report goes privately to the repository's maintainer, not to the public. GitHub adds you to the draft advisory as a collaborator, so the conversation about it stays private too.

Dexter is a learning project maintained by one person. There is no bug bounty and no guaranteed response time, but every report will be read and answered. Only the latest version on `main` is supported.
