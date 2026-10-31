import 'dotenv/config';
import { spawnSync } from 'node:child_process';
if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL in apps/api/.env or the environment.');
const result = spawnSync('pnpm', ['--filter', '@sistabrew/db', 'migrate'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
