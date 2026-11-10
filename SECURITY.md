# Security

This document explains Dexter's security: what the app is, which security risks apply to it, how each is handled, which risks don't apply and why, and what is still a known limitation. Every claim points at the code, configuration or test that backs it up.

It describes Dexter as it is on `main` in November 2026 (end of milestone M4). Dexter isn't deployed yet; deployment over HTTPS is milestone M5.

**Risk list used:** the [OWASP Top 10:2025](https://top10.owasp.org/2025/), the current edition. The category names below are copied from the official OWASP site (checked 9 November 2026). (M4 plan, decision D28.)

**Status labels used below**

| Label | Meaning |
|---|---|
| ✅ Handled | The risk applies, and Dexter has protections in place for it |
| ◐ Partly | The risk applies, and the protections only cover part of it |
| ➖ Doesn't apply | The risk needs something Dexter doesn't have (a server, accounts, secrets…) |

## 1. What Dexter is, and where the boundaries are

Dexter is a Pokédex and team builder that runs **entirely in the visitor's browser**.

- **What is served:** static files only (HTML, JavaScript, CSS, a favicon). They come from nginx in a Docker container ([`Dockerfile`](Dockerfile), [`nginx/default.conf.template`](nginx/default.conf.template)).
- **What Dexter doesn't have:**
  - no backend code
  - no database
  - no user accounts, logins, cookies or sessions
  - no secrets: no API keys, and no `.env` file is used
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

**What is worth protecting**, given there's nothing secret on a server:

- **The integrity of the page:** no one else's code should run inside Dexter (injection, section 3 A05).
- **The visitor's teams:** they mustn't be corrupted or lost by bad data (A08, A10).
- **The visitor's privacy towards third parties:** no referrer information is sent, and no tracking is used (section 4).
- **Being a fair user of a free API:** the request budget, in the README.

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
| **Form input** (team names, nicknames) | zod rules in [`src/domain/team.ts`](src/domain/team.ts): names 1–30 characters and unique; nicknames 1–12 letters, numbers and spaces | An inline error message; nothing is saved | [`src/domain/team.test.ts`](src/domain/team.test.ts), e.g. "accepts markup-like text as plain text" |

## 3. OWASP Top 10:2025, category by category

### A01:2025 Broken Access Control — ➖ Doesn't apply

**What it is:** users acting beyond their permissions, e.g. reading someone else's data or calling an admin function. OWASP 2025 also files CSRF and SSRF here.

**Why it doesn't apply to Dexter:**

- There are no users, roles or permissions, and no server-side data or functions to protect. Everything Dexter shows is either public (PokéAPI) or the visitor's own data, in their own browser.
- **CSRF** (another site making your browser send a request "as you"): there is no server that changes anything, and no cookies or logins to ride on.
- **SSRF** (tricking a server into fetching an address of the attacker's choice): Dexter's server only serves its own static files and never fetches anything ([`nginx/default.conf.template`](nginx/default.conf.template)).

The browser itself keeps each site's `localStorage` separate, so other websites can't read Dexter's saved teams. Anyone using the same device can, though (section 6).

**Revisit if:** Dexter ever gets accounts or a backend.

### A02:2025 Security Misconfiguration — ✅ Handled

**What it is:** insecure settings, such as missing security headers, default configurations, or a server revealing too much.

**How Dexter handles it:**

- **Security headers on every response, error pages included.** They're set once in [`nginx/security-headers.inc.template`](nginx/security-headers.inc.template) and included in **every** `location` in [`nginx/default.conf.template`](nginx/default.conf.template). In nginx, a header set inside a location would otherwise cancel the shared ones. They're sent with `always`, so a 404 gets them too. Each header is explained in section 4.
- **No version number revealed:** `server_tokens off` makes the server say just `nginx`.
- **A minimal container:** non-root user 101, only the files needed to serve the app, and Alpine's latest security fixes installed at build time (`apk upgrade` in the [`Dockerfile`](Dockerfile)).
- **Correct caching:** fingerprinted assets are cached for a year, and `index.html` is checked every time, so a security fix reaches visitors on their next visit.

**Evidence:**

- [`e2e/headers.spec.ts`](e2e/headers.spec.ts) checks every header, the exact CSP, the hidden version and the cache headers. It covers `/`, a deep link, an `/assets/` file, `/healthz` and a missing file (404), against the production container, on every pull request.
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
- **Least privilege in CI:** both workflows have `permissions: contents: read`.

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

- PokéAPI and the artwork are only fetched over HTTPS ([`src/api/client.ts`](src/api/client.ts)), and the CSP only allows those `https://` addresses.
- HSTS (section 4) makes browsers stick to HTTPS once Dexter is deployed over HTTPS in M5. Locally (`http://localhost`), browsers ignore it.

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
4. **Values placed in addresses are encoded.** Names are URL-encoded before they're sent to PokéAPI ([`src/api/client.ts`](src/api/client.ts)). An export's file name is reduced to letters, numbers and dashes (`teamFileName` in [`src/domain/teamFile.ts`](src/domain/teamFile.ts)).

**Evidence:**

- [`src/components/TeamImport.test.tsx`](src/components/TeamImport.test.tsx): "imports a name containing markup, and shows it as text: no img element appears".
- [`src/domain/listParams.test.ts`](src/domain/listParams.test.ts) and [`src/domain/team.test.ts`](src/domain/team.test.ts): markup kept as text.
- [`e2e/headers.spec.ts`](e2e/headers.spec.ts): the CSP has no `unsafe-inline` or `unsafe-eval`.
- [`e2e/fixtures.ts`](e2e/fixtures.ts): **every** E2E test fails on any CSP violation, so all the journeys prove the app runs under the strict policy.

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

**Remaining exposure:** the base images are pinned by tag, not digest (A03, section 6).

### A09:2025 Security Logging and Alerting Failures — ◐ Partly

**What it is:** not noticing or recording security-relevant events, so problems go undetected.

**What Dexter has:**

- **Alerts about the code and its dependencies:**
  - CI fails on lint, type, test, E2E, header or CSP problems, and on fixable serious vulnerabilities (Trivy).
  - Dependabot alerts.
  - A **daily smoke test** against the live PokéAPI ([`.github/workflows/smoke.yml`](.github/workflows/smoke.yml)), whose failure shows red in the Actions tab and sends a GitHub notification. The alarm was tested with a deliberate failure in M4 H9.
- **Server logs:** nginx writes access and error logs to the container's output; the health check is excluded (`access_log off` in [`nginx/default.conf.template`](nginx/default.conf.template)).

**Why only partly:**

- With no server-side users or actions, there are no security events about users to record. That part of the category has little to apply to.
- Dexter has **no error reporting from visitors' browsers**. That's deliberate: it would mean sending data to a third party and widening `connect-src`.
- Nothing yet keeps or watches the nginx logs, because Dexter isn't deployed. That is M5's job.

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

**Evidence:**

- [`src/api/client.test.ts`](src/api/client.test.ts) (timeouts, 404, invalid responses).
- [`src/components/StorageNotice.test.tsx`](src/components/StorageNotice.test.tsx) (every storage state).
- [`src/storage/teamStorage.test.ts`](src/storage/teamStorage.test.ts).

**Why only partly:** there is **no React error boundary**. An unexpected bug while drawing a page, or a page's code failing to download, leaves a **blank page** with no message. This was seen once during M4 testing, when a network change interrupted a page's code download. Section 6 has the details.

## 4. Security headers

They're set in [`nginx/security-headers.inc.template`](nginx/security-headers.inc.template) and checked by [`e2e/headers.spec.ts`](e2e/headers.spec.ts). You can see them yourself with `curl -I http://localhost:8080/`.

| Header | Value | What it does |
|---|---|---|
| `Content-Security-Policy` | see below | Lists the only places the page may load anything from, and forbids inline scripts, event-handler attributes and `eval`. A second line of defence against XSS, not a replacement for showing data as text (A05). |
| `Strict-Transport-Security` | `max-age=31536000` | Once a browser has seen Dexter over HTTPS, it uses only HTTPS for it for a year. Ignored over plain `http://localhost`. No `includeSubDomains` or `preload`: we won't own the parent domain of the M5 address. |
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
| `connect-src https://pokeapi.co` | data requests to PokéAPI only | Dexter's code can't send data to any other address with `fetch`, which also limits what a bug could leak |
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
| **HSTS only works over HTTPS** | Locally, over `http://localhost`, browsers ignore it | Dexter isn't deployed yet | Takes effect with HTTPS deployment in M5 |
| **Headers aren't yet checked on a deployed site** | The brief asks for header checks on the deployed site in CI | `e2e/headers.spec.ts` takes `E2E_BASE_URL`, ready to point at the deployment | M5 |
| **Runtime configuration (M5) must not weaken the CSP** | M5 makes the API address configurable when the container starts | The plan requires the setting to come from a same-origin file (never an inline script, which `script-src 'self'` forbids), and `connect-src` to follow the configured address | Recorded for M5 (M4 plan §5.1) |
| **Base images are pinned by tag, not digest** | A tag can be republished with different contents | Trivy scans every built image; Dependabot proposes updates | Open (A03) |
| **`apk upgrade` makes builds not exactly reproducible** | Two builds on different days can contain slightly different patch versions | Every build is scanned | Accepted in M4 H8 (PR #43) |
| **The Trivy image digest is updated by hand** | Dependabot can't update a digest inside a `docker run` command | The procedure is in [`docs/vulnerability-triage.md`](docs/vulnerability-triage.md) | Accepted |
| **No error reporting from visitors' browsers; server logs aren't kept yet** | Problems in real use would only be noticed if reported (A09) | CI, Trivy, Dependabot and the daily smoke test cover the code and its dependencies | Logs: M5. Browser error reporting: not planned. |
| **The daily smoke test pauses itself** after 60 days without repository activity (a GitHub rule for public repositories) | The early warning would stop silently | One click in the Actions tab re-enables it | Accepted |

## 7. Reporting a vulnerability

Please report security problems **privately**, not in a public issue. Dexter uses GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability). You need to be signed in to GitHub.

1. Go to the repository's main page on GitHub.
2. Under the repository name, click the **Security and quality** tab. If you can't see it, open the **⋯** menu and choose **Security and quality** there.
3. Click **Report a vulnerability**.
4. Fill in the form: a summary, the details, how to reproduce it (proof of concept), and what an attacker could do with it (impact).
5. Click **Submit report**.

The report goes privately to the repository's maintainer, not to the public. GitHub adds you to the draft advisory as a collaborator, so the conversation about it stays private too.

Dexter is a learning project maintained by one person. There is no bug bounty and no guaranteed response time, but every report will be read and answered. Only the latest version on `main` is supported.
