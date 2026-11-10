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
**What I changed and why:** Picked zod (the recommended option) because it was what was most widely used and so felt moe reliable. 
**What I did not understand at first:** I did not understand even the need for a library like Zod or what it did. Once I understood it's functionality, it made sense and a larger download didn't seem much of a factor.

## 2026-10-28 - First API endpoint: one Pokémon by name
**Context:** M1 needs a typed, schema-validated client for one endpoint. I had to pick which one.
**What I asked the AI:** Which endpoint the first client function should cover.
**What it gave me:** Two options: `GET /pokemon/{name}` or the paginated list `GET /pokemon?limit=20&offset=0`. It recommended the single Pokémon: richer data to validate (types, stats, abilities, artwork that can be `null`), a real 404 for unknown names, and both the detail page and the list cards will need it. The list endpoint only returns names and URLs, with no types or artwork.
**Verified against:** Real PokéAPI responses for `eevee`, `pikachuu` (404), `pikachu-gmax`, `koraidon-sprinting-build` and `pecharunt`. They showed that a single Pokémon is a ~249 KB response, height and weight come in decimetres and hectograms, artwork URLs can be `null`, and alternate forms point back to their species (`pikachu-gmax` → `pikachu`).
**What I changed and why:** Picked one Pokémon by name (the recommended option) because it provides richer data to validate
**What I did not understand at first:** The concept of a first API connection. But as explained, at the beginning, the app needed its first working connection to PokéAPI. The decision was about which kind of request to teach the API client to make first. One option asks for one specific Pokémon, the other asks for a page of Pokémon from a list. So the decision was: “Should the first API function fetch one Pokémon’s information, or fetch a slice of the Pokémon index?”



## 2026-10-29 - Test stack: Vitest, jsdom, React Testing Library, MSW
**Context:** M2 needs green unit and component tests. The repo had no test runner or test script.
**What I asked the AI:** Choose a test stack that works with our actual Vite and React versions, and check compatibility before recommending versions.
**What it gave me:**
- **Vitest** runs the tests and is made for Vite.
- **jsdom** is a fake browser page so components can render in Node.
- **React Testing Library**, user-event and jest-dom let tests render components, act like a user, and check what is on screen.
- **MSW** answers the app's API requests with fake responses, so tests never hit the real PokéAPI.

It found one conflict. jsdom 30 needs Node ≥ 22.22.2, and my local Node is 22.13.1 (CI and Docker are newer). It proposed jsdom 29, which supports Node ^22.13. It also proposed MSW 2.x over the new 3.x because the v2 API is what most documentation describes.

**What I changed and why:** Accepted. Upgrading local Node would allow the newest versions instead. Upgrading local Node seemed like a minor, inconsquential fix to enable a test stack.
**What I did not understand at first:** What a test stact would do - now I understand it is a group of tools for running automatic checks on the code.

## 2026-10-29 - Router: React Router v7, declarative mode
**Context:** The brief requires a client-side router with list, detail and not-found routes. The list state lives in the URL.
**What I asked the AI:** Pick a conventional router that supports the routes, query parameters and browser history.
**What it gave me:** React Router in "declarative mode" (`BrowserRouter`, `Routes`, `useParams`, `useSearchParams`, `Link`). It can either replace the current history entry or add a new one, which the search-history rule needs. Its data loaders are not used, because TanStack Query handles data. v8 needs Node ≥ 22.22.0, so v7 (Node ≥ 20) was chosen.
**Verified against:** `npm view react-router@7` and `react-router` (v8) engines and peer dependencies, 2026-10-29.
**What I changed and why:** Accepted.  I added React Router v7. I chose its simpler declarative setup because this app needs the router to match URLs to pages, while TanStack Query already handles API data. The URL holds the list settings so a list view can be refreshed, bookmarked or shared, and the browser history can restore earlier list views. 
**What I did not understand at first:** What a client side router does (decides which React screen to show for the current URL) or declartive mode (the app describes the URL-to-screen map directly in JSX)

## 2026-10-29 - Data fetching: TanStack Query
**Context:** The brief requires caching, retries, cancelling unneeded requests, loading and error states, and never showing results for an older query. API data must also be kept separate from state the user owns.
**What I asked the AI:** Use an established library rather than building our own cache.
**What it gave me:** TanStack Query v5 (works with React 19). The plan:
- **Cancellation:** pass TanStack's `signal` to our client, so requests are cancelled when they become out of date or unused.
- **Retries:** retry network errors, timeouts and 5xx only, never 404 or invalid responses, using TanStack's default backoff.
- **Timeouts:** added in our API client as a new `timeout` error kind.
- **Caching:** set both `staleTime` and `gcTime` to `Infinity`. With only `staleTime` set, the default 5-minute `gcTime` would throw away data for pages you left, and going back would request it again. That breaks the brief's "returning to a page you have already seen makes none".

API data lives in TanStack Query. List state (page, search, types) lives in the URL. Teams come in M3.

**What I changed and why:** I asked for TanStack Query instead of a hand-written cache.
**What I did not understand at first:** It seemed more time efficent and reliable to use something already established than building from scratch. 

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
**What I changed and why:** Accepted the approach and asked for a safeguard on the id assumption. 
**What I did not understand at first:** , I didn’t understand that the app would fetch one list of species names and URLs, search that list locally, and fetch full details only for the Pokémon shown on the current page.




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
**What I changed and why:** Accepted 
**What I did not understand at first:** I didn't understand how offline requests were handled by the data-fetching library, or that its default behaviour could leave the application in a perpetual loading state. I hadn't realised that handling offline scenarios required a deliberate decision about how requests should behave when an internet connection is unavailable.


## 2026-11-04 - Team state: React Context + useReducer, separate from API data
**Context:** M3 adds teams, the first state that I own rather than data from PokéAPI. The brief asks me to keep API data separate from user state and to justify how each is managed.
**What I asked the AI:** While planning M3, to identify the decisions M3 needs and recommend options. For this one: where team state should live and how components read and change it.
**What it gave me:** Four options: React Context + useReducer; a small external store read with useSyncExternalStore; Zustand with its persist middleware (a new dependency); and keeping teams in TanStack Query, which it advised against because it mixes user state into the API cache. It recommended Context + useReducer, with the reducer calling pure team functions and a separate storage module for loading and saving. That keeps the split clear: API data in TanStack Query, list settings in the URL, teams in a TeamsProvider.
**What I changed and why:** Accepted Context + useReducer. I prefer using what is already built into React rather than adding a state-management library.
**What I did not understand at first:** Why teams needed a shared state mechanism at all. I now understand that several parts of the app (the list, the detail page and the team pages) need the same team data, so it makes sense to manage it in one shared place.

## 2026-11-04 - Teams are saved in localStorage
**Context:** Teams must persist across page reloads, in the browser. There is no backend.
**What I asked the AI:** Which browser storage to use, and how it can fail.
**What it gave me:** localStorage (keeps data across browser sessions, stores text only, about 5 MiB per site, throws an error when storage is blocked or full, cleared after private windows close), IndexedDB (asynchronous, larger, more complex), and sessionStorage (lost when the tab closes). It recommended localStorage, with teams kept in memory and a notice shown if storage is blocked, and a notice suggesting export if a save fails.
**Verified against (checked by the AI during planning):** MDN Window.localStorage; MDN "Storage quotas and eviction criteria".
**What I changed and why:** Chose localStorage. It keeps teams between browser sessions and seems relatively straightforward to implement. IndexedDB looked like extra complexity.
**What I did not understand at first:** The different browser storage options.

## 2026-11-04 - A team stores species names and nicknames; team ids are random UUIDs
**Context:** I had to decide what a saved team actually contains. That also decides what an exported file contains, and what an imported file is trusted for.
**What I asked the AI:** How to represent a team, and how to identify its members and the team itself.
**What it gave me:** Store each member as a species name plus an optional nickname, and load types, stats and artwork from PokéAPI when needed (sharing the detail page's cache). It advised against storing copies of stats and types, because an edited or hostile file could carry false values. Team ids come from crypto.randomUUID(), which only works on secure pages (https and localhost).
**Verified against (checked by the AI during planning):** MDN Crypto.randomUUID; MDN Secure contexts.
**What I changed and why:** Accepted. My understanding is that we store a reference to the Pokémon and get the rest of its information from the existing API when needed, which avoids duplicating information.
**What I did not understand at first:** I hadn't realised that we needed to make a deliberate decision about whether user-created teams should persist when the page is refreshed or reopened, or where that information should be stored. Once the distinction between React state and local storage was explained, I understood the options.

## 2026-11-04 - Team names must be unique, ignoring capitalisation and spaces
**Context:** The brief says team names are validated in the form and on import, but doesn't say what the rules are.
**What I asked the AI:** Sensible rules for team names.
**What it gave me:** Required after trimming spaces, 1 to 30 characters, no control characters, other characters allowed (React shows them as text, so markup is harmless). It recommended allowing duplicate names, because uniqueness isn't in the brief and it would make imports clash.
**What I changed and why:** I changed this. Team names must be unique, because it doesn't make sense to have several teams with effectively the same name. Names count as the same regardless of capitalisation or surrounding spaces, so "Rain Team", "rain team" and " Rain Team " clash. The rule applies when creating, renaming and importing a team.
**What I did not understand at first:** I hadn't considered that the application would need rules for determining whether two team names should be treated as duplicates.

## 2026-11-04 - Nicknames: Unicode letters, numbers and spaces, 1 to 12 characters
**Context:** The brief says a nickname is optional and has 1 to 12 characters: letters, numbers and spaces only.
**What I asked the AI:** How to apply that rule precisely.
**What it gave me:** Two readings: English letters only (A–Z), or letters from any language (Unicode). For Unicode, it suggested normalising accented letters so "é" always counts as one letter, counting characters rather than code units, trimming spaces at the ends, and treating an empty nickname as no nickname.
**What I changed and why:** Chose Unicode letters and numbers plus spaces. Punctuation and symbols are not allowed, and nicknames keep the brief's 1–12 character limit, so the rule follows the original brief.
**What I did not understand at first:** I hadn't realised that we needed to define which characters were permitted in nicknames. Once the options were explained, I preferred Unicode support because restricting users to English letters seemed unnecessarily limiting.

## 2026-11-04 - One set of zod rules for forms, saved teams and imported files
**Context:** The brief says the team-name and nickname rules must give clear inline messages in forms, and the same rules must apply to imported files.
**What I asked the AI:** How to share the validation rules and show the errors.
**What it gave me:** zod schemas for team names, nicknames and whole teams, used by the forms, by the code that loads saved teams, and by the import. Each message is written once. In forms, the message appears under the field and is linked to it for screen readers. It advised against adding a form library.
**Verified against (checked by the AI during planning):** zod.dev error customisation; zod 4.6.7 type definitions (the `message` option is deprecated in favour of `error`).
**What I changed and why:** Accepted zod. It is already part of the project, so it makes sense to reuse it rather than add another validation library or write separate validation code for different parts of the app.
**What I did not understand at first:** I hadn't previously considered that the validation rules would need to be shared across forms, browser storage and imported files. I understand now why that consistency matters.

## 2026-11-04 - Saved data is versioned; valid teams are salvaged and the original is kept until I choose
**Context:** The brief says saved data carries a schema version, and corrupted or outdated data must be detected on load, with a way to recover instead of a white screen.
**What I asked the AI:** How to version saved teams and recover from bad data.
**What it gave me:** Save teams with a version number and run upgrades for older versions. When some teams can't be read, three options: all or nothing (lose everything), salvage the valid teams, or silently reset (not allowed by the brief). It recommended salvaging, with a download of the original data.
**What I changed and why:** Chose salvage. It doesn't make sense to lose valid data just because some of the saved data is corrupted. I added a rule: the original saved data must be kept until I explicitly choose a recovery action, and the app must never silently overwrite data it can't understand, especially data saved by a newer version.
**What I did not understand at first:** I hadn't realised that saved data needed a versioning strategy, or that changes to the application's data structure could affect information saved by earlier versions of the application.

## 2026-11-04 - Team analysis: an immune member counts as protection
**Context:** The brief says to highlight any attacking type that three or more members are weak to "and none resist". It doesn't say whether an immune member counts as resisting.
**What I asked the AI:** Exact definitions for the analysis.
**What it gave me:** Weak = 2× or 4×, resist = ½× or ¼×, immune = 0×, using the existing matchup calculation. Two readings of the highlight: literal (only ½× and ¼× count as resisting) or immunity also counts as protection. It recommended the second, because an immune member covers that weakness even better than a resistant one.
**What I changed and why:** Accepted that immunity counts as protection when deciding whether to highlight a type. Weak, resist and immune stay as three separate counts on screen. 
**What I did not understand at first:** I didn't understand the Pokémon type system or how type effectiveness worked.

## 2026-11-04 - Reordering a team with Move up / Move down buttons
**Context:** The brief says team members can be reordered.
**What I asked the AI:** How the reordering should work.
**What it gave me:** Move up / Move down buttons, or drag and drop. Drag and drop doesn't work with a keyboard on its own, so it would still need buttons, and a drag-and-drop library would add a dependency.
**What I changed and why:** Chose the buttons. It is simpler and gives a keyboard-accessible alternative to drag and drop.
**What I did not understand at first:** I hadn't realised that we needed to decide how users would reorder team members, or that there were different ways of implementng this functionality.

## 2026-11-04 - Two open tabs stay in sync through the storage event
**Context:** With teams in localStorage, two tabs could each hold their own copy and overwrite each other's changes.
**What I asked the AI:** Whether and how to handle the app being open in two tabs.
**What it gave me:** Accept and document it; listen for the browser's storage event (which fires in the other tabs when one tab saves) and reload teams from storage; or use BroadcastChannel, which adds nothing here. It recommended the storage event.
**Verified against (checked by the AI during planning):** MDN "Window: storage event" (not fired in the tab that made the change; fired in other tabs of the same site).
**What I changed and why:** Chose the storage event. Without it, tabs could hold different versions of the teams and one tab could silently overwrite changes made in another. It seemed a reasonable balance between preventing stale data and avoiding unnecessary complexity. Limitation: it doesn't resolve simultaneous edits. If two tabs save at nearly the same moment, the later save wins.
**What I did not understand at first:** I hadn't realised that each browser tab maintains its own application state, even when both tabs use the same local storage. I also hadn't considered that changes made in one tab would need to be communicated to the other to keep their displayed information consistent.

## 2026-11-09 - Hosting: Render Free, defined by a Render Blueprint instead of Terraform
**Context:** M5 needs Dexter deployed over HTTPS, with the infrastructure defined as code (Terraform preferred, or a documented equivalent). My overriding constraint: it must cost R0, with no risk of unexpected charges, so no payment card or billing account.
**What I asked the AI:** While planning M5, to compare hosting options for this app on cost, complexity and infrastructure-as-code support, and to find out whether any option is genuinely free, without counting trials or credits.
**What it gave me:**
- Google Cloud Run, Azure Container Apps, AWS, Koyeb and Oracle all need a card or billing account. Fly.io and Railway only offer a trial or credits. Fly.io's Terraform provider is archived, and AWS App Runner no longer takes new customers. Static hosts are free but can't run our container image.
- Render's free web service needs no payment method. Without one, going over the free limits means **suspension until the next month, not a bill**. The free limits: 750 instance hours and 5 GB of outbound bandwidth a month. The service sleeps after 15 minutes idle and takes about a minute to wake.
- Render's free plan **can't be managed with Terraform**. Render's API refuses to create free services (an anti-abuse measure), and an open bug in the latest provider makes updates to free services fail. Render's own infrastructure-as-code, a **Blueprint** (`render.yaml` in the repo), does support `plan: free`.
- Region: Frankfurt rather than Singapore. The two are about the same distance from Johannesburg, but South Africa's undersea cables land mainly in Europe. Measured from my connection: 183 ms to Frankfurt and 324 ms to Singapore (fastest of 15 tries).
**Verified against (checked by the AI during planning, 2026-11-09):**
- Render docs: "Free instances" (spin-down, 750 hours, suspension without a payment method), "Outbound bandwidth" (Hobby 5 GB; services spun down until next month without a payment method), "Blueprint YAML reference" (`runtime: image`, `plan: free`, `healthCheckPath`, `envVars`), "Infrastructure as code" (auto sync can be turned off) and "Deploy hooks" (`imgURL` for a specific tag or digest).
- `render-oss/terraform-provider-render` on GitHub: issue #44 (maintainer: the API doesn't allow creating free services) and issue #80 / PR #105 (updates to free services fail, still open on v1.9.1).
- Checked by me in the Render dashboard in step R1 (2026-11-10), without creating a service: sign-up with GitHub asked for no card; the new web service form let me choose an existing Docker image with the **Free** instance type; the form has a **Health Check Path** field. I cancelled before creating the service.
- Not verified in R1 (accepted as assumptions): that a free service gets a **deploy hook** (Render's docs don't list it as missing from Free, but don't confirm it either); that the image actually deploys and runs on Free; and whether Render adds or changes response headers such as HSTS or `Server`. The Billing page wasn't checked. These are first tested when the real service is created in step R7.
**What I changed and why:** Chose Render Free with a Blueprint, in Frankfurt, and never adding a payment method. Zero risk of charges matters more to me than Terraform, which the brief prefers but doesn't require. I accept the free tier's limits: cold starts, the 5 GB limit and possible suspension. Blueprint auto sync stays off, so infrastructure changes only apply when I review them and press Manual Sync.
**What I did not understand at first:** TODO: fill in yourself.

## 2026-11-09 - Runtime config: environment variables turned into /config.js when the container starts
**Context:** The brief requires one image for every environment. The API base URL and an environment name shown in the footer must be supplied when the container starts, not when it is built. Vite writes `import.meta.env` values into the JavaScript at build time, so that can't be used. The solution must also keep the M4 Content Security Policy (CSP) as strict as it is.
**What I asked the AI:** While planning M5, how to supply these values at container start without weakening the CSP.
**What it gave me:**
- Two required environment variables, `DEXTER_API_BASE_URL` and `DEXTER_ENVIRONMENT`. The image has no default values: the container refuses to start if either is missing or invalid.
- At start, a small script checks them against strict patterns (an `https://` address; a short lower-case name). The nginx image's built-in template step then serves `/config.js`, a one-line file holding the two values, and writes the API's address into the CSP's `connect-src`. `index.html` loads `/config.js` as an ordinary script file before the app, and the app checks the values again with zod.
- Rejected alternatives: a `/config.json` the app fetches (it would need `connect-src 'self'`, but the brief limits `connect-src` to the API); rewriting the built JavaScript at start (it changes files whose names promise their content never changes); an inline script (the CSP bans it); and having nginx insert a meta tag into every page (it works, but is harder to explain).
**Verified against (checked by the AI during planning, 2026-11-09):** inside the `nginxinc/nginx-unprivileged:1.30.6-alpine3.24` image itself: `/docker-entrypoint.sh` sources `*.envsh` start-up scripts and stops on errors (`set -e`); `20-envsubst-on-templates.sh` fills in only environment variables that are actually set (narrowed further by `NGINX_ENVSUBST_FILTER`); `/etc/nginx/conf.d` is writable by the unprivileged user. The CSP's `script-src 'self'` already allows a script file from our own site. MDN "<script>: The Script element" (checked in step R3, 2026-11-10): a plain script is "fetched and executed immediately before the browser continues to parse the page", while module scripts "defer by default", so `/config.js` runs before the app. Seen working in a browser against the container in R3.
**What I changed and why:** Accepted. The CSP keeps exactly the same rules: scripts only from our own site, and data only from the configured API. A wrong value stops the container before it serves anything, so on Render the previous version keeps running instead of a broken one.
**What I did not understand at first:** TODO: fill in yourself.

## Where AI cost me time

Times the AI sent me down a wrong path: hallucinated APIs, outdated React patterns, code that looked right and was not.

<!-- Add entries here. -->
