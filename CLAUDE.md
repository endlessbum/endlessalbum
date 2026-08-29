# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Endlessalbum ("Альбом") is a Russian-language memory-sharing web app for couples: a shared account holds memories (photo/video/text/quote), a real-time chat (with server-controlled ephemeral messages), mini-games synced over WebSocket, counters, music, and per-couple settings. The UI is Russian; user-facing strings and validation messages are written in Russian.

Full narrative docs live in `README.md` and `replit.md` (both Russian). When they disagree with code, trust the code — e.g. ephemeral TTL is defined by `EPHEMERAL_MESSAGE_TTL_MINUTES` in `shared/constants.ts`, not the "5 minutes" mentioned in prose.

## Commands

```bash
npm run dev            # dev server: Express + Vite HMR (tsx watch). Auto-picks next free port if 5000 busy
npm run check          # TypeScript typecheck (runs tsc via `node` — required on Windows)
npm run lint           # ESLint (warnings allowed)
npm run lint:strict    # ESLint with --max-warnings=0 (enforced by pre-commit + `npm run verify`, NOT CI)
npm run lint:fix       # ESLint --fix
npm run format         # Prettier write
npm test               # Vitest unit tests, single run (dot reporter)
npm run test:watch     # Vitest watch mode
npm run test:changed   # Vitest, only tests affected by changed files (dot reporter)
npm run smoke          # In-memory MemStorage smoke script (scripts/smoke.ts)
npm run verify         # check + lint:strict + test + smoke — the full gate
npm run build          # Vite build (client) + esbuild bundle (server) → dist/
npm start              # Run built server (NODE_ENV=production)
npm run db:push        # drizzle-kit push — apply schema to Postgres
```

### Running a single test

```bash
npx vitest run tests/utils.test.ts          # one unit test file
npx vitest run -t "substring of test name"  # by test name

npm run -s e2e -- -g "games-smoke"          # one Playwright spec by grep
npm run -s e2e:ui                            # Playwright UI mode
```

### E2E notes (Playwright)

- One-time browser install: `npm exec -- @playwright/test install`.
- `playwright.config.ts` **starts its own server** (`tsx server/index.ts`) with `NODE_ENV=test`, `DATABASE_URL=''`, `RATE_LIMIT_DISABLED=1` — so E2E always runs against in-memory storage. Base URL is `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:5000`).
- On Windows, if PowerShell reports "Could not determine Node.js install directory", use the node-CLI variants: `npm run -s e2e:node` / `npm run -s e2e:ui:node`.
- Prefer stable `data-testid` selectors over text/roles (see `e2e/utils.ts` for multi-user invite/login helpers; `README.md` documents the game phase testids).
- **E2E testid conventions** (established during the redesign-stabilization pass, see `HANDOFF.md`):
  - Game cards use **hyphens**: `game-card-truth-or-dare`, `game-card-twenty-questions`, `game-card-role-playing`, `game-card-partner-quiz` — the DOM testid converts `_` → `-` (`games-page.tsx`), while the WS/DB `GameType` values in `shared/ws-messages.ts` keep underscores and must not change.
  - Chat: the bubble is `message-<id>`; ephemeral media children are `message-<id>-ephemeral-media` / `-ephemeral-lock-overlay` / `-ephemeral-timer`. Nested message controls (`actions-menu-<id>`, `edit-action-<id>`, `delete-action-<id>`, `reaction-action-<id>`, `reaction-heart-<id>`, `reaction-count-<id>`, `read-mark-<id>`) must NOT start with `message-`, because specs use `[data-testid^="message-"]` + `.last()` which must resolve to the bubble. The chat input container is `chat-input-container`.
  - `button-save-profile` stays enabled after a successful save (the profile form is not reset on submit).
  - Settings write `ui:chatBackground` / `ui:font` to localStorage immediately on select (not only after the async `PUT`).
  - The avatar upload button must stay `type="button"` (it lives inside the profile `<form>`; a bare `<button>` would default to `submit`).
- Current E2E state: full run is green — **48 passed / 3 skipped / 0 failed** (3 skipped are runtime-only: ephemeral video in headless Chrome, music delete/edit on empty track list). The final failures were closed in the last session: profile remounting was fixed by hoisting inline `<Suspense>` route wrappers to module-scope components in `client/src/App.tsx`, and `twenty-questions-flow` by re-syncing `partnerOnline` from the `/api/partner` REST snapshot (`wsStatusReceivedRef` + `useEffect` on `partnerData`). Known residual flake: `a11y-auth-smoke`/`a11y-smoke` occasionally time out in `beforeEach` under parallel workers (not axe violations; use `workers: 1` if it reproduces). `npm run check`, `lint:strict`, `test` (112) and `smoke` pass. The redesign is committed (`4f4bb42`); only `client/src/App.tsx`, `client/src/components/games/twenty-questions.tsx` and `client/src/pages/profile-page.tsx` are uncommitted. Playwright system deps may need re-installing after `npm install`: `DEBIAN_FRONTEND=noninteractive npx playwright install-deps chromium`.

## Architecture

Single Node process serves both the API and the client. In dev, Vite runs as Express middleware (`server/vite.ts`); in prod, the client is prebuilt and served statically. Entry point: `server/index.ts`.

### Storage abstraction (the key server pattern)

`server/storage.ts` defines an `IStorage` interface with **two implementations**, selected at import time by the `storage` singleton:

- `MemStorage` — in-memory Maps, used when `DATABASE_URL` is unset **and** `NODE_ENV` is `development`/`test`.
- `PgStorage` — Drizzle + `pg` pool, used whenever `DATABASE_URL` is set.
- Outside dev/test, a missing `DATABASE_URL` throws.

**When adding a data operation, add it to `IStorage` and implement it in BOTH classes**, or dev/test (Mem) and prod (Pg) will diverge. `tests/memstorage.test.ts` and `npm run smoke` exercise MemStorage without a database.

### Data model — couple-centric

Everything is scoped to a `couple` (see `shared/schema.ts`). A couple has a `mainAdminId` and optional `coAdminId` (max 2 people). Registration: the first/admin user creates a couple and generates an `inviteCode`; a partner joins via that code and is assigned a role. Roles: `main_admin | co_admin | guest | user`. `memories`, `messages`, `games`, `counters`, `comments` all carry a `coupleId`; guest access to memories/comments is gated by per-couple `settings.privacy` (checked via `checkGuestAccess` in `routes.ts`).

### Shared types & validation

`shared/` is imported by both client and server via aliases. `shared/schema.ts` is the single source of truth: Drizzle tables → `drizzle-zod` insert schemas → inferred TS types → server-side request schemas (e.g. `serverMessageSchema`, `wsGameActionSchema`). Validate request bodies against these Zod schemas in routes rather than trusting client input.

### Real-time (WebSocket)

`server/routes.ts` mounts a `ws` server on path `/ws` (same HTTP server). Auth happens in `verifyClient`: it parses the `connect.sid` cookie, looks the session up in `storage.sessionStore`, and attaches `userId` — there is no token in the URL. The connection is then rejected unless the user has a `coupleId`. Includes per-IP connection limits and a ping/pong heartbeat that terminates dead sockets. Game and chat messages are typed as discriminated unions in `shared/schema.ts`; `shared/ws-messages.ts` now only holds the `GameType`/`gameTypeValues` constants.

Client game components (`client/src/components/games/*`) follow a specific handler ordering to avoid "used before declaration" and stale-state bugs: declare callbacks before the `useEffect`, or handle inline in `ws.onmessage`, and read live state via `useRef` snapshots. See `README.md` → "Паттерн обработчиков WebSocket в играх".

### CSRF (double-submit, affects every mutation)

`server/csrf.ts` guards all mutating methods (POST/PUT/DELETE/PATCH): it requires matching CSRF token across the **session, a cookie, and the `X-CSRF-Token` header**, plus an allowed `Origin`/`Referer`. CSRF is skipped when `NODE_ENV=test`.

On the client, **always go through `client/src/lib/queryClient.ts`** — `apiRequest`/`csrfFetch` fetch and cache the token from `/api/csrf-token` and inject the header automatically. For file uploads use `csrfUploadFetch` (FormData) or `attachCsrfHeader` (XHR/Uppy). A raw `fetch` for a mutation will be rejected. See `docs/security.md` for the full CSRF flow.

### Auth & sessions

`server/auth.ts` — Passport local strategy, scrypt password hashing, `express-session` backed by `storage.sessionStore` (memorystore in Mem, connect-pg-simple in Pg). Cookies are httpOnly + `sameSite: strict` + secure-in-prod. `SESSION_SECRET` is required in production.

### Uploads

Media is stored locally under `public/uploads/*` and served at `/uploads`. `server/multer-config.ts` defines per-type multer handlers and size limits (limits live in `shared/constants.ts`). Cloud (GCS) is wired but optional.

### Frontend

React 18 + Vite + Tailwind + shadcn/ui (Radix primitives in `client/src/components/ui`). Routing via **Wouter** (`client/src/lib/protected-route.tsx` guards authed pages). Server state via **TanStack Query** (`queryClient` has `staleTime: Infinity`, no refetch-on-focus, no retry; global error toasts are wired in `queryClient.ts`). Pages in `client/src/pages`, cross-cutting hooks in `client/src/hooks` (`use-auth`, `use-audio-player`).

## Design system (REDESIGN.md) — монохром, dark-only

The visual design is defined by `REDESIGN.md` and enforced in `client/src/index.css` + `tailwind.config.ts`:

- **Strictly three colors**: `#000000` (background/surfaces), `#FFFFFF` (text/accents), `#B6B6B6` (secondary/meta/borders). No other colors, gradients, glows, or alpha-created shades. Hover/focus/disabled/selected states must not introduce new colors.
- **Dark is the only visual theme**: tokens live unconditionally on `:root`/`.light`; `ThemeProvider` defaults to `dark` (`defaultTheme="dark"`, storageKey `app-theme`). The `light`/`dark` classes still toggle on `<html>` (E2E `settings-appearance.spec.ts` asserts classList) but the palette is identical either way.
- **Helper classes in `index.css` are flat** (no `backdrop-filter`): `.glass`/`.glass-strong` = `--surface` + `--border-subtle`, `.modal-backdrop` = `--background`, `.btn-gradient` = `--accent-strong`/`--accent-hover`, `.pulse-online` = opacity pulse, `.ephemeral-timer` = `--surface-hover`/`--primary-foreground`, `.hover-lift` has no translateY.
- **Conventions when editing UI**: use tokens (`text-text-primary`, `bg-surface-hover`, `border-border-subtle`, …) — never raw `hsl/rgb/hex`, never `bg-black/xx` overlays (use `bg-background`), never color words (`bg-red-500`, `text-green-600`). Keep `data-testid`s, accessible names (role=link «Главная/Музыка/Сообщения/Профиль/Настройки», button «Добавить»), and WS/DB protocol values (`GameType` with underscores in `shared/ws-messages.ts`) unchanged.
- **`chatBackgrounds.ts`**: every option renders solid `#000000`; keys/labels are preserved (E2E depends on option «Голубой»).
- There are **dead duplicate files** (not imported, kept consistent): `client/src/components/chat-message.tsx`, `client/src/components/ui/avatar-upload.tsx`, `client/src/components/BottomNav.tsx`, `client/src/components/ui/BottomNav.tsx`. The live chat bubble is `client/src/components/ui/chat-message.tsx`.


- **Path aliases** `@` → `client/src`, `@shared` → `shared`. Defined **three times** — `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` — keep them in sync when adding one (`@assets` exists only in vite/vitest).
- **Typecheck runs `tsc` through `node`** (`node ./node_modules/typescript/bin/tsc`) deliberately for Windows compatibility; use `npm run check`, not bare `tsc`.
- **Tests do not load `.env`** and force `DATABASE_URL` empty (`server/config.ts` + `tests/setup.ts`). To test against a real DB, set `DATABASE_URL` and run outside `NODE_ENV=test`.
- **Server files import `./config` first** (side-effects: loads/masks `.env`, then runs `assertEnvironmentSafety()` — fail-fasts on an unknown `NODE_ENV` and refuses to boot production with active security bypasses: missing `SESSION_SECRET`/`DATABASE_URL`, `RATE_LIMIT_DISABLED=1`, or disabled DB TLS). Preserve it as the first import in server entry modules.
- **Ephemeral message expiry is server-authoritative**; the client-supplied duration is ignored.
- Pre-commit (husky + lint-staged) runs Prettier + eslint --fix on staged files, then tsc, strict lint, and Vitest — commit in small batches to keep it fast.
- `npm run verify` (check + lint:strict + test + smoke) is the strictest local gate. CI is more lenient on lint: `ci.yml` runs the **non-strict** `npm run lint` (warnings allowed by design — see the comment in the workflow), plus a client/server build and a Docker image build; `e2e.yml` runs Playwright E2E + axe a11y. Zero-warning lint is therefore a local-only gate (pre-commit + `verify`), never CI. `deploy.yml` triggers Render (`render.yaml`, health check `/api/health`).