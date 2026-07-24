# UCSD Course Planner

An independent student project for searching UC San Diego courses in the
**Triton Student System (TSS)** and planning a class schedule.

Live catalog data comes from the authenticated TSS OData API. This app never
submits enrollments — “Enroll on TSS” opens the official portal so you
finish registration there.

## What it does

1. You sign into [tss.ucsd.edu/fiori](https://tss.ucsd.edu/fiori) (SSO + Duo).
2. You paste a temporary TSS session cookie into the app.
3. You search courses for the current (or upcoming) term, expand sections, and
   add sections to your plan.
4. You review the plan as a list, weekly calendar, or finals grid

Plans are stored only in the browser (`localStorage`). TSS credentials never
leave the server after you connect.

## Technical decisions

### Why cookie paste (for now)

TSS login is Shibboleth SSO + Duo. There is no username/password API to call.
Cookie paste is an explicit stopgap: the user completes the real login
themselves, then hands the app a short-lived session so it can proxy OData
reads. Future work could replace this with an embedded remote browser login
that streams to the website but this is a little complex and requires more 
backend resources.

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
