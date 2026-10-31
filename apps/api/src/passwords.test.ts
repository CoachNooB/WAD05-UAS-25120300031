import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './passwords.js';
import { registerSchema } from '@sistabrew/shared';
test('bcrypt stores a salted cost-12 hash and verifies only the correct password', async () => {
  const password = 'SistaBrewTest!2026';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^\$2b\$12\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('IncorrectPassword!', first), false);
});
test('password validation rejects UTF-8 inputs above bcrypt’s byte limit', async () => {
  const password = 'é'.repeat(37);
  assert.throws(() => hashPassword(password));
  assert.equal(
    registerSchema.safeParse({ name: 'Test', email: 'test@example.com', password }).success,
    false,
  );
  const hash = await hashPassword('a'.repeat(72));
  assert.equal(await verifyPassword('a'.repeat(72) + 'b', hash), false);
});
