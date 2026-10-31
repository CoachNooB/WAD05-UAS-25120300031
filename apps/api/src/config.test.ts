import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function load(overrides: Record<string, string> = {}) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "const { demo, localDemo, store, cookie } = await import('./src/config.ts'); console.log(JSON.stringify({ demo, localDemo, store, cookie }));",
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://test:test@localhost/test',
        DEMO_MODE: 'true',
        SESSION_SECRET: 'test-only-session-secret-with-at-least-32-characters',
        APP_ORIGIN: 'https://demo.example.com',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_STORAGE_SECRET_KEY: 'test-only-key',
        SUPABASE_STORAGE_BUCKET: 'demo',
        STORE_ADDRESS: '',
        DELIVERY_SERVICE_AREA: '',
        BANK_NAME: 'A real bank must never appear in a demo',
        BANK_ACCOUNT_NUMBER: '1234567890',
        BANK_ACCOUNT_HOLDER: 'Private account',
        ...overrides,
      },
    },
  );
}

test('hosted demo uses cloud persistence, fictional bank details and secure cookies', () => {
  const result = load();
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.demo, true);
  assert.equal(config.localDemo, false);
  assert.equal(config.store.demo, true);
  assert.equal(config.store.bank.accountNumber, 'DEMO-ONLY');
  assert.equal(config.cookie.secure, true);
});

test('hosted demo still requires a database, private storage and a strong session secret', () => {
  const missingSettings: Record<string, string>[] = [
    { DATABASE_URL: '' },
    { SUPABASE_STORAGE_SECRET_KEY: '' },
    { SESSION_SECRET: 'short' },
  ];
  for (const overrides of missingSettings) {
    const result = load(overrides);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Production requires/);
  }
});

test('live mode still requires store and payment configuration', () => {
  const result = load({ DEMO_MODE: 'false' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production requires/);
});
