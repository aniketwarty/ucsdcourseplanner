# UCSD Course Planner

An independent student project for searching UC San Diego courses in the
**Triton Student System (TSS)** and planning a conflict-aware weekly schedule.

Live catalog data comes from the authenticated TSS OData API. This app never
submits enrollment mutations — “Enroll on TSS” opens the official portal so you
finish registration there.

> Not an official UC San Diego product. Treat it as a personal planning tool.

## What it does

1. You sign into [tss.ucsd.edu/fiori](https://tss.ucsd.edu/fiori) (SSO + Duo).
2. You paste a temporary TSS session cookie into the app.
3. You search courses for the current (or upcoming) term, expand sections, and
   add section packages to a plan.
4. You review the plan as a list, weekly calendar, or finals grid; overlaps are
   flagged but not blocked.
5. You optionally export an `.ics` file or open TSS to enroll.

Plans are stored only in the browser (`localStorage`). TSS credentials never
leave the server after you connect.

## Important limitations

- **Read-only TSS access.** No automated enrollment, waitlisting, or TEA flows.
- **TSS terms only.** Course search starts at Fall 2026, when TSS became the
  system of record. Earlier ISIS terms are out of scope.
- **Cookie paste auth.** UCSD Shibboleth + Duo cannot be automated safely, so
  v1 uses a short-lived session cookie you copy from DevTools. Treat that value
  like a temporary password.
- **Schematic term dates.** Instruction and finals windows in
  [`lib/tss/terms.ts`](lib/tss/terms.ts) are approximate calendar anchors for
  the UI, not live registrar feeds.
- **Acceptable Use.** UCSD IT resources must be used only for authorized
  purposes, and account access must stay private. Get approval before running
  this publicly.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| API | Next.js Route Handlers (`app/api/**`) — no separate Express server |
| Sessions / rate limits | Upstash Redis (HTTP REST) |
| Validation | Zod |
| Calendar | FullCalendar time-grid |
| Tests | Vitest (configured; add fixtures under `tests/`) |

## Technical decisions

### Why Next.js Route Handlers instead of Express

The app is meant to deploy on Vercel. A separate long-running Express process
adds hosting cost and complexity without helping a thin TSS proxy. Route
Handlers keep the BFF colocated with the UI, stay serverless-friendly, and make
it easy to keep TSS cookies/`X-CSRF-Token` behind `import "server-only"` modules.

### Why Upstash Redis

Vercel functions do not share memory across invocations. Sessions and rate
limits need a shared store. Upstash’s REST Redis client works over HTTP (no
sticky TCP connections), has a free tier suitable for a prototype, and also
accepts Vercel KV-style env aliases (`KV_REST_API_URL` /
`KV_REST_API_TOKEN`).

Credentials are **AES-256-GCM encrypted** before they hit Redis. The browser
only receives an opaque HTTP-only cookie (`ucsd_planner_session`). Sessions
expire after **30 minutes** and are deleted on logout or upstream 401/403.

### Why cookie paste (for now)

TSS login is Shibboleth SSO + Duo. There is no username/password API to call.
Cookie paste is an explicit stopgap: the user completes the real login
themselves, then hands the app a short-lived session so it can proxy OData
reads. Future work could replace this with an embedded remote browser login;
automated enrollment remains deliberately out of scope.

### Why `$batch` for search and a plain GET for sections

TSS search is issued as an OData v4 `$batch` multipart request to match the
real Fiori client. Section meetings come from the module navigation property
`/_sections` as a plain authenticated GET — that endpoint does not need batch
wrapping. Multipart parsing lives in [`lib/tss/multipart.ts`](lib/tss/multipart.ts);
`Sched` string parsing / section grouping lives in
[`lib/tss/schedule.ts`](lib/tss/schedule.ts).

### Multi-term backend, single active term in the UI

[`lib/tss/terms.ts`](lib/tss/terms.ts) models UCSD undergrad periods as used by
TSS (`AcademicPeriod` 2 Fall, 3 Winter, 4 Spring, 5 Summer Session 1, 7 Summer
Session 2; summer-trailing academic years). Search and sections APIs accept
optional `year` + `period` and reject unsupported terms.

The UI currently plans **`getCurrentTerm()`** only (the term underway, or the
next upcoming TSS term). Plan packages still store year/period so multi-term
storage already works; a term picker can wire up later via
`listAvailableTerms()`.

### Conflicts are advisory

Overlapping meetings are highlighted (and can be filtered in search), but adds
are never blocked. Students often consider overlapping options while shopping
for seats.

### Enrollment is a hand-off

“Booking” in this project means: plan here, enroll on the official TSS site.
That keeps ToS/risk surface smaller than replaying enrollment mutations.

## Project layout

```text
app/
  page.tsx                 # Renders the planner shell
  api/auth/session/        # Connect / status / disconnect
  api/courses/search/      # Course search proxy
  api/courses/[moduleId]/sections/
components/planner/        # Client UI (search, plan pane, calendar, auth)
lib/
  tss/                     # OData client, terms, parsers, errors
  session/                 # Encrypted Upstash session store
  api/                     # Cookie helpers + requireRequestSession
  planner/                 # Plan model, conflicts, ICS, calendar events
  rate-limit.ts            # Per-endpoint Upstash sliding windows
```

## Local setup

**Prerequisites:** Node.js 20+, npm, and a free [Upstash Redis](https://upstash.com/)
database.

1. `npm install`
2. Create `.env.local` in the repo root:

   ```dotenv
   UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-standard-rest-token
   SESSION_ENCRYPTION_KEY=64-hex-characters
   ```

3. Generate the encryption key:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. `npm run dev` → [http://localhost:3000](http://localhost:3000)
5. Sign into TSS in another tab, copy `SAP_SESSIONID_S4P_500` (or a full cookie
   header that includes it), and paste it into the app. **Do not put that value
   in chat, screenshots, commits, or issue reports.**

### Commands

```bash
npm run dev        # development server
npm run lint       # ESLint
npm test           # Vitest
npm run test:watch
npm run build
npm start
```

## Deploy (Vercel Hobby + Upstash free)

1. Push to a **personal** GitHub repository (Hobby cannot deploy private repos
   owned by GitHub orgs).
2. Import the repo into a Vercel Hobby project (Next.js defaults are fine).
3. Create an Upstash Redis database (or install the Upstash Vercel integration).
4. Set `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or `KV_*`
   aliases), and a **unique** `SESSION_ENCRYPTION_KEY` for Production / Preview
   / Development.
5. Redeploy after saving env vars.

Vercel Hobby is for personal, non-commercial use. Watch Upstash command quotas
and Vercel fair-use limits; sessions TTL and rate limits keep normal traffic
modest.

### Rate limits

| Endpoint family | Limit |
| --- | --- |
| Auth | 10 requests / 10 minutes |
| Search | 60 / minute |
| Sections | 90 / minute |

Limits key off the app session when present, otherwise client IP.

## API

All course endpoints require a connected app session.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/session` | Body `{ "cookie": "..." }` → CSRF fetch + Redis session |
| `GET` | `/api/auth/session` | `{ "connected": boolean }` only — never returns TSS secrets |
| `DELETE` | `/api/auth/session` | Clears Redis + HTTP-only cookie |
| `GET` | `/api/courses/search?q=...&year=&period=` | `q` 2–80 chars; omit year/period → current term |
| `GET` | `/api/courses/:moduleId/sections?year=&period=` | Grouped packages with parsed meetings / finals |

Errors use `{ "error": { "code", "message" } }`. Upstream auth failures return
`SESSION_EXPIRED` and wipe the server session.

## Security checklist for contributors

- Never log cookies, CSRF tokens, or Redis envelopes.
- Keep TSS I/O in `lib/tss/**` and Route Handlers — do not call `tss.ucsd.edu`
  from the browser.
- Prefer sanitized error messages over upstream body passthrough.
- When adding features that mutate enrollment, re-read UCSD AUP / ToS first.

## Roadmap ideas

- In-app term picker using `listAvailableTerms()`
- Embedded remote-browser SSO (replace cookie paste)
- Still **not** planned without explicit ToS review: automated enrollment
  submission
