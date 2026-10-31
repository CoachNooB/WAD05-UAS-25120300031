# Deploy the SistaBrew demo to Vercel

This demo uses two Vercel projects, TiDB for data/sessions, and a private Supabase Storage bucket for images. `DEMO_MODE=true` shows the demo login accounts and fictional payment instructions while retaining cloud persistence. Node 24 is pinned in both apps.

## 1. Prepare the services

Use a TiDB database and Supabase bucket dedicated to this demo. The published demo admin can edit the catalog and review orders, so keep real customer data and real payment receipts out of them.

- TiDB: use its TLS-enabled MySQL connection URL as `DATABASE_URL`. For a small demo, add `connection_limit=2` to the URL query (use `&` if a query already exists).
- Supabase: create a **private** Storage bucket, such as `sistabrew-demo`. Copy its project URL and server secret/service-role key. Do not make the bucket public or put the key in the frontend.
- Keep `.env` files out of the source repository; `.gitignore` already excludes them.

## 2. Create two Vercel projects

Import the same source repository twice. Enable access to source files outside the Root Directory for both projects so they can use `packages/`.

| Setting          | API project                      | Web project                      |
| ---------------- | -------------------------------- | -------------------------------- |
| Root Directory   | `apps/api`                       | `apps/web`                       |
| Framework        | Express                          | Vite                             |
| Node version     | 24.x                             | 24.x                             |
| Install          | Automatic pnpm workspace install | Automatic pnpm workspace install |
| Build            | From `vercel.json`               | From `vercel.mjs`                |
| Output directory | Framework default                | `dist`                           |

Record the stable production domains of both projects. Use those domains below, rather than a temporary deployment-specific URL.

## 3. Set environment variables

Set these for the **Production** environment in the API project. Also set them in Preview if you intend to use preview deployments; preview frontend origins must be explicitly allowed.

```dotenv
NODE_ENV=production
DEMO_MODE=true
DATABASE_URL=<TiDB TLS connection URL>
SESSION_SECRET=<a randomly generated secret of at least 32 characters>
APP_ORIGIN=https://<your-web-project>.vercel.app
ALLOWED_ORIGINS=https://<your-web-project>.vercel.app
SUPABASE_URL=https://<your-supabase-project>.supabase.co
SUPABASE_STORAGE_SECRET_KEY=<server secret or service-role key>
SUPABASE_STORAGE_BUCKET=sistabrew-demo
```

Generate a session secret locally with `openssl rand -hex 32` and enter it directly in Vercel. Keep it stable across deployments so sessions remain valid.

`APP_ORIGIN` and each comma-separated `ALLOWED_ORIGINS` entry must be a complete origin without a trailing slash or path. Include custom frontend domains if you use them. Bank settings are ignored in demo mode; the application displays `DEMO-ONLY`. Store address and delivery area have fictional defaults.

In the **web** project set:

```dotenv
API_ORIGIN=https://<your-api-project>.vercel.app
```

This is the HTTPS API origin, without `/api`. `vercel.mjs` creates the `/api/*` proxy and SPA fallback from it; no file editing or placeholder URL replacement is necessary. Do not create a second `vercel.json` in `apps/web`. No database or Supabase credentials belong in the web project.

## 4. Migrate and seed once

From the repository root, install dependencies:

```sh
pnpm install --frozen-lockfile
```

Set `DATABASE_URL` and `DEMO_MODE=true` in your local `apps/api/.env` for the **same demo database**. Preserve your other local settings. The CLI reads this file; it does not automatically read your Vercel environment variables.

```sh
pnpm db:migrate:deploy
pnpm db:seed
```

These are explicit setup commands, not part of the Vercel build or request startup. Migrations create the required tables. Seeding creates fictional catalog records only when there are no categories and creates any missing demo accounts, even when a catalog already exists. It preserves existing stock, orders, account passwords, and catalog edits. Re-running seed does not refill stock.

| Role            | Email                  | Password             |
| --------------- | ---------------------- | -------------------- |
| Customer        | `alya@sistabrew.test`  | `sistabrewDemo!2026` |
| Second customer | `nadia@sistabrew.test` | `sistabrewDemo!2026` |
| Admin           | `admin@sistabrew.test` | `sistabrewDemo!2026` |

Demo mode intentionally uses these public credentials; `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` apply to live mode only. If a same-email account already has a different password or role, seed refuses to overwrite it. Use a fresh dedicated demo database in that case. Existing old `@halosis.test` accounts are preserved; new demo accounts use `@sistabrew.test`.

## 5. Deploy API, then web

Deploy/redeploy the API with its environment variables, then deploy the web project with `API_ORIGIN` set. Environment changes require a redeployment.

The API domain must allow unauthenticated incoming requests from the web project's proxy. If Vercel Deployment Protection redirects API calls to a Vercel sign-in page, adjust the demo API's protection settings. Application login and role checks still protect its admin endpoints.

Open the **web URL** for the demonstration. All browser API requests stay under that origin through the proxy, including session cookies. Do not switch the frontend to direct cross-origin API calls.

## 6. Check the hosted demo

1. Visit `<web URL>/api/health`: expect `{"data":{"status":"ok"}}`. This checks routing and startup; it does not check the database.
2. Visit `<web URL>/api/products`: expect catalog records. This checks database access.
3. Sign in as the demo customer, refresh, and verify that login persists. Open `/orders` directly to check SPA routing.
4. Place a pickup or delivery order and check the fictional payment instructions. No real transfer is needed.
5. Upload a sample JPEG, PNG or WebP under **2 MiB** as proof. Use fictional imagery.
6. Sign in as the demo admin, view the proof, approve it, and move the order through fulfillment.
7. Upload a product image and reload the storefront to verify Supabase signed images display.
8. Confirm that records and images remain available after a redeployment.

If login fails, check API logs, migrations, demo seeding, allowed frontend origin, and secure session cookies. If uploads fail, check the private bucket name/key and file size. If API requests return HTML, check Deployment Protection and `API_ORIGIN`.

The local test suite uses an isolated JSON repository; it does not verify TiDB concurrency or deployed Supabase connectivity. `pnpm test:integration` requires a **separate migrated disposable** `TEST_DATABASE_URL`; do not point it at the presentation database.

## Local verification

```sh
pnpm test
pnpm build
pnpm lint
```

The application deliberately refuses filesystem demo storage under `NODE_ENV=production`, even with `DEMO_MODE=true`. Hosted demos always require TiDB and private Supabase storage.

Configuration references: [Vercel Express](https://vercel.com/docs/frameworks/backend/express), [programmatic Vercel configuration](https://vercel.com/docs/project-configuration/vercel-ts), and [monorepo setup](https://vercel.com/docs/monorepos).
