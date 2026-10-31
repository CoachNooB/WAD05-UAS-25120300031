# SistaBrew

A shop for syrups, drink powders, and beverage extras built with Vue 3, TypeScript, Express 5, Prisma 6, TiDB, and private Supabase Storage.

## Run locally

Use Node 24 and pnpm 10.28.2.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:5173**. The API runs on port 3001 and Vite proxies `/api`.

With an empty `DATABASE_URL`, the app uses a local demo with fictional products and JSON persistence in `apps/api/.data/`. Local uploads and data are excluded from Git. This adapter is for a single local process; deployed apps require TiDB and Supabase.

| Account         | Email                | Password           |
| --------------- | -------------------- | ------------------ |
| Customer        | alya@sistabrew.test  | sistabrewDemo!2026 |
| Second customer | nadia@sistabrew.test | sistabrewDemo!2026 |
| Admin           | admin@sistabrew.test | sistabrewDemo!2026 |

## Deploy the demo

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the two Vercel projects, environment variables, migrations, seeding, and hosted checks.

Set `DEMO_MODE=true` on the API to enable the same public demo accounts and fictional payment instructions with TiDB/Supabase persistence. This does **not** enable filesystem storage in production. Never make a real transfer for a demo order.

## Use TiDB and Supabase locally

Copy `apps/api/.env.example` to `apps/api/.env`, then fill the database URL and private storage settings. Keep server credentials out of Vue and source control.

```sh
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

For a cloud-backed local demo, set `DEMO_MODE=true` before seeding. For live mode, use `DEMO_MODE=false` and provide `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Seed preserves existing accounts and adds catalog records only when categories are empty. It never resets passwords or replenishes existing stock.

Production always requires a database, private storage credentials, a session secret of at least 32 characters, and an exact frontend origin. Live mode additionally requires store, delivery, and bank configuration. Production cookies are Secure, HttpOnly, host-only, and SameSite=Lax.

## Verify

```sh
pnpm test
pnpm build
pnpm lint
```

Tests isolate their temporary database from `apps/api/.env`. They cover authentication, authorization, CSRF, checkout, stock reservation, order cancellation, payment review, sessions, image validation, password hashing, and hosted demo configuration.

For TiDB integration checks, separately migrate a disposable database, set `TEST_DATABASE_URL`, and run `pnpm test:integration`. It checks foreign keys, rollback, stock contention, cancellation replay and persistent sessions, then deletes its own fixtures. Cloud storage and deployed proxy/cookie behavior require the hosted checks in the deployment guide.

`pnpm db:maintenance` removes expired sessions/counters and retries known orphan-image deletion. Run it explicitly; there is no in-process cleanup timer.

## Code map

- `apps/web/src/App.vue`: storefront, customer flows and admin studio.
- `apps/web/src/stores.ts`: cart/auth state and API client.
- `apps/web/vercel.mjs`: hosted API proxy, SPA fallback and security headers.
- `apps/api/src/app.ts`: Express application, controllers and request validation.
- `apps/api/src/services.ts`: checkout, order and payment transactions.
- `apps/api/src/storage.ts`: image validation, private storage and cleanup.
- `apps/api/src/session.ts`: database-backed sessions.
- `packages/shared`: request schemas and order lifecycle rules.
- `packages/db`: Prisma schema, SQL migration and client.

Passwords use bcrypt at cost 12, with a minimum of 12 characters and a maximum of 72 UTF-8 bytes. Existing non-bcrypt accounts require an explicit password reset. AI assistance was used to implement and verify this project; review and understand it before academic submission.
