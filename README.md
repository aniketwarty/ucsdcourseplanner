# UCSD Course Planner

A Fall 2026 course-search and schedule-planning interface for UC San Diego's
Triton Student System (TSS). Search results and section availability come from
the authenticated TSS OData service. Enrollment itself always happens on the
official TSS site.

## Important limitations

- This is an independent student project, not an official UC San Diego service.
- It supports Fall 2026 only (`AcademicYear=2026`, `AcademicPeriod=2`).
- It does not submit enrollment requests. “Enroll on TSS” opens the official
  portal for the user to complete enrollment.
- TSS uses SSO and Duo. The app therefore asks for a temporary TSS session
  cookie after the user signs in directly at `tss.ucsd.edu`.
- A TSS cookie is as sensitive as a temporary password. Never share one in
  chat, screenshots, source code, logs, or issue reports.
- UCSD's Acceptable Use Policy permits access only for authorized purposes and
  requires account access to remain private. Obtain UCSD approval before
  offering this app publicly.

## Stack

- Next.js 16 App Router and React 19
- Next.js Route Handlers as a server-only TSS proxy
- Upstash Redis for encrypted, expiring sessions and distributed rate limits
- FullCalendar for the weekly schedule
- Tailwind CSS 4 and TypeScript
- Vitest for parser and planning-unit tests

## Local setup

Prerequisites: Node.js 20+ and a free
[Upstash Redis](https://upstash.com/) database.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the REST URL and token shown in the Upstash console.
4. Generate a separate session-encryption key:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. Start the app with `npm run dev`.
6. Open [http://localhost:3000](http://localhost:3000), sign into TSS in a
   separate tab, and follow the connection instructions in the app.

The required variables are:

```dotenv
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-rest-token
SESSION_ENCRYPTION_KEY=64-hex-characters
```

The Upstash SDK also accepts Vercel's `KV_REST_API_URL` and
`KV_REST_API_TOKEN` aliases.

## Commands

```bash
npm run dev        # local development
npm run lint       # ESLint
npm test           # unit tests
npm run test:watch # watch unit tests
npm run build      # production build
npm start          # serve the production build
```

As of July 2026, `npm audit` reports a moderate PostCSS advisory through
Next.js 16.2.10. That is the latest stable Next.js release, and npm's suggested
“fix” is an unsafe downgrade to Next 9. Do not force that downgrade; update
Next.js when a patched stable release becomes available.

## Free Vercel deployment

1. Push the repository to a private Git provider repository.
2. Import it into a Vercel Hobby project.
3. Create an Upstash Redis database on its free plan, either from Upstash or
   through Vercel's integration.
4. Add the three environment variables above to Development, Preview, and
   Production. Use a unique `SESSION_ENCRYPTION_KEY` in production.
5. Redeploy after adding the variables.

Both products currently offer free tiers suitable for a small prototype, but
their quotas and pricing can change. Rate limits and the 30-minute session TTL
keep normal usage modest; monitor both dashboards to avoid exceeding free
allowances.

## Security model

The browser receives only a random, HTTP-only app-session identifier. The TSS
cookie and CSRF token are encrypted with AES-256-GCM before being stored in
Upstash, expire after 30 minutes, and are deleted on logout or an upstream
401/403 response. TSS credentials are never returned by an API response or
written to browser storage. Only non-sensitive planned-course data is persisted
in `localStorage`.

All TSS requests use a fixed upstream origin, validated inputs, timeouts,
sanitized errors, and per-endpoint distributed rate limits. Do not add
credential logging while debugging.

## API

- `POST /api/auth/session` validates a pasted TSS cookie, fetches a CSRF token,
  and creates the short-lived app session.
- `GET /api/auth/session` reports only whether the app session is connected.
- `DELETE /api/auth/session` removes the server-side session.
- `GET /api/courses/search?q=...` searches Fall 2026 courses.
- `GET /api/courses/:moduleId/sections?year=2026&period=2` returns grouped,
  parsed section meetings.

## Verification

Automated tests use sanitized protocol fixtures and never real credentials.
The final integration check must be performed locally by the account owner,
who enters the temporary cookie directly into the app. Verify search, section
loading, calendar conflicts, session expiry, and the final TSS hand-off without
copying the credential into logs or test files.
