import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
const directory = await mkdtemp(join(tmpdir(), 'sistabrew-test-'));
process.env.DEMO_DATA_FILE = join(directory, 'demo.json');
process.env.DEMO_UPLOAD_DIR = join(directory, 'uploads');
// Keep dotenv from loading developer database/seed settings into this isolated suite.
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.SEED_ADMIN_EMAIL = 'admin@sistabrew.test';
process.env.SEED_ADMIN_PASSWORD = 'sistabrewDemo!2026';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
const { app } = await import('./app.js');
const { seed } = await import('./seed.js');
const { db, transaction } = await import('./database.js');
const { DatabaseSessionStore } = await import('./session.js');
const origin = 'http://localhost:5173';
const password = 'sistabrewDemo!2026';
const customer = request.agent(app),
  other = request.agent(app),
  admin = request.agent(app);
let customerToken = '',
  otherToken = '',
  adminToken = '';
const body = (items = [{ productId: 1, quantity: 1 }], method = 'PICKUP') => ({
  items,
  recipientName: 'Alya Test',
  recipientPhone: '081234567890',
  fulfillmentMethod: method,
  ...(method === 'LOCAL_DELIVERY' ? { deliveryAddress: 'Test street 10, Bandung' } : {}),
});
const mutate = (agent: any, method: string, path: string, token: string) =>
  agent[method](path).set('Origin', origin).set('X-CSRF-Token', token);
async function login(agent: any, email: string) {
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const result = await mutate(agent, 'post', '/api/auth/login', token).send({ email, password });
  assert.equal(result.status, 200);
  assert.notEqual(result.body.data.csrfToken, token);
  return result.body.data.csrfToken;
}
async function order(items?: any, method?: string) {
  return mutate(customer, 'post', '/api/orders', customerToken)
    .set('Idempotency-Key', randomUUID())
    .send(body(items, method));
}
before(async () => {
  await seed();
  const seededAdmin = await db.user.findUnique({ where: { email: 'admin@sistabrew.test' } });
  await seed();
  assert.equal(await db.user.count(), 3);
  assert.equal(await db.product.count(), 12);
  assert.equal(
    (await db.user.findUnique({ where: { email: 'admin@sistabrew.test' } })).passwordHash,
    seededAdmin.passwordHash,
  );
  customerToken = await login(customer, 'alya@sistabrew.test');
  otherToken = await login(other, 'nadia@sistabrew.test');
  adminToken = await login(admin, 'admin@sistabrew.test');
});
after(async () => {
  await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
test('catalog hides inactive products and combines search/category filters', async () => {
  const result = await request(app).get('/api/products?q=strawberry&categoryId=1');
  assert.equal(result.body.meta.total, 1);
  assert.equal(result.body.data[0].name, 'Strawberry Bliss');
  assert.equal((await request(app).get('/api/products/12')).status, 404);
  assert.equal((await request(app).get('/api/products?pageSize=51')).status, 422);
});
test('CSRF, Origin, authentication and role boundaries', async () => {
  assert.equal((await customer.post('/api/orders').send(body())).status, 403);
  assert.equal(
    (
      await customer
        .post('/api/orders')
        .set('X-CSRF-Token', customerToken)
        .set('Origin', 'https://evil.test')
        .send(body())
    ).status,
    403,
  );
  assert.equal((await customer.get('/api/admin/products')).status, 403);
  assert.equal((await request(app).get('/api/orders')).status, 401);
  assert.equal(
    (
      await mutate(other, 'post', '/api/auth/register', otherToken).send({
        name: 'Evil',
        email: 'evil@example.com',
        password,
        role: 'ADMIN',
      })
    ).status,
    422,
  );
});
test('checkout snapshots prices, computes delivery, replays same key and rejects mismatches', async () => {
  const k = randomUUID();
  const stock = (await db.product.findUnique({ where: { id: 1 } })).stock;
  const payload = body([{ productId: 1, quantity: 2 }], 'LOCAL_DELIVERY');
  const create = () =>
    mutate(customer, 'post', '/api/orders', customerToken).set('Idempotency-Key', k).send(payload);
  const first = await create();
  assert.equal(first.status, 201);
  assert.equal(first.body.data.total, 151000);
  assert.equal(first.body.data.items[0].unitPrice, 68000);
  const replay = await create();
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data.id, first.body.data.id);
  assert.equal((await db.product.findUnique({ where: { id: 1 } })).stock, stock - 2);
  const mismatch = await mutate(customer, 'post', '/api/orders', customerToken)
    .set('Idempotency-Key', k)
    .send(body());
  assert.equal(mismatch.status, 409);
  assert.equal((await other.get('/api/orders/' + first.body.data.id)).status, 404);
});
test('failed checkout rolls back earlier decrements and creates no order', async () => {
  const stock = (await db.product.findUnique({ where: { id: 1 } })).stock;
  const count = await db.order.count();
  assert.equal(
    (
      await order([
        { productId: 1, quantity: 1 },
        { productId: 9, quantity: 1 },
      ])
    ).status,
    409,
  );
  assert.equal((await db.product.findUnique({ where: { id: 1 } })).stock, stock);
  assert.equal(await db.order.count(), count);
});
test('parallel checkout for the final unit permits only one order', async () => {
  await transaction((tx) => tx.product.update({ where: { id: 3 }, data: { stock: 1 } }));
  const results = await Promise.all([
    order([{ productId: 3, quantity: 1 }]),
    order([{ productId: 3, quantity: 1 }]),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await db.product.findUnique({ where: { id: 3 } })).stock, 0);
});
test('duplicate checkout requests reserve stock once', async () => {
  const k = randomUUID();
  const stock = (await db.product.findUnique({ where: { id: 4 } })).stock;
  const create = () =>
    mutate(customer, 'post', '/api/orders', customerToken)
      .set('Idempotency-Key', k)
      .send(body([{ productId: 4, quantity: 1 }]));
  const results = await Promise.all([create(), create()]);
  assert.ok(results.every((r) => r.status === 201 || r.status === 200));
  assert.equal(results[0].body.data.id, results[1].body.data.id);
  assert.equal((await db.product.findUnique({ where: { id: 4 } })).stock, stock - 1);
});
test('cancellation restores stock exactly once even on retries', async () => {
  const stock = (await db.product.findUnique({ where: { id: 1 } })).stock;
  const o = (await order()).body.data;
  const cancel = () => mutate(customer, 'post', `/api/orders/${o.id}/cancel`, customerToken);
  assert.equal((await cancel()).status, 200);
  assert.equal((await cancel()).status, 200);
  assert.equal((await db.product.findUnique({ where: { id: 1 } })).stock, stock);
});
test('checkout rejects totals, duplicate products and incomplete delivery', async () => {
  for (const payload of [
    { ...body(), total: 1 },
    body([
      { productId: 1, quantity: 1 },
      { productId: 1, quantity: 1 },
    ]),
    { ...body(), fulfillmentMethod: 'LOCAL_DELIVERY', deliveryAddress: 'x' },
  ])
    assert.equal(
      (
        await mutate(customer, 'post', '/api/orders', customerToken)
          .set('Idempotency-Key', randomUUID())
          .send(payload)
      ).status,
      422,
    );
});
test('payment upload, ownership, replay, rejection, resubmission and fulfillment', async () => {
  const o = (await order()).body.data;
  const image = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#e7a7bd' },
  })
    .png()
    .toBuffer();
  const k = randomUUID();
  const submit = (token = customerToken, agent = customer, submissionKey = k, buffer = image) =>
    mutate(agent, 'post', `/api/orders/${o.id}/payments`, token)
      .set('Idempotency-Key', submissionKey)
      .attach('file', buffer, 'receipt.png');
  assert.equal((await submit(otherToken, other)).status, 404);
  assert.equal(
    (await submit(customerToken, customer, randomUUID(), Buffer.from('<svg>bad</svg>'))).status,
    415,
  );
  const first = await submit();
  assert.equal(first.status, 201);
  assert.equal(first.body.data.proofPath, undefined);
  const pid = first.body.data.id;
  assert.equal((await submit()).status, 200);
  assert.equal((await submit(customerToken, customer, randomUUID())).status, 409);
  assert.equal(
    (await mutate(customer, 'post', `/api/orders/${o.id}/cancel`, customerToken)).status,
    409,
  );
  assert.equal((await other.get(`/api/payments/${pid}/proof-url`)).status, 404);
  assert.equal((await admin.get(`/api/payments/${pid}/proof-url`)).status, 200);
  assert.equal(
    (
      await mutate(admin, 'post', `/api/admin/payments/${pid}/reject`, adminToken).send({
        rejectionReason: '',
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await mutate(admin, 'post', `/api/admin/payments/${pid}/reject`, adminToken).send({
        rejectionReason: 'Please send the full receipt.',
      })
    ).status,
    200,
  );
  const second = await submit(customerToken, customer, randomUUID());
  assert.equal(second.status, 201);
  const approve = () =>
    mutate(admin, 'post', `/api/admin/payments/${second.body.data.id}/approve`, adminToken);
  assert.equal((await approve()).status, 200);
  assert.equal((await approve()).status, 200);
  const update = (status: string) =>
    mutate(admin, 'patch', `/api/admin/orders/${o.id}/status`, adminToken).send({ status });
  assert.equal((await update('COMPLETED')).status, 409);
  assert.equal((await update('PROCESSING')).status, 200);
  assert.equal((await update('OUT_FOR_DELIVERY')).status, 409);
  assert.equal((await update('READY_FOR_PICKUP')).status, 200);
  assert.equal((await update('COMPLETED')).status, 200);
  assert.equal((await customer.get('/api/orders/' + o.id)).body.data.status, 'COMPLETED');
  assert.equal(
    (await mutate(customer, 'post', `/api/orders/${o.id}/cancel`, customerToken)).status,
    409,
  );
});
test('history restricts deletion; product edits preserve price/name snapshots', async () => {
  const o = (await order()).body.data;
  assert.equal((await mutate(admin, 'delete', '/api/admin/products/1', adminToken)).status, 409);
  assert.equal((await mutate(admin, 'delete', '/api/admin/categories/1', adminToken)).status, 409);
  assert.equal(
    (
      await mutate(admin, 'patch', '/api/admin/products/1', adminToken).send({
        name: 'Updated name',
        price: 70000,
      })
    ).status,
    200,
  );
  const historical = (await customer.get('/api/orders/' + o.id)).body.data;
  assert.equal(historical.items[0].productName, 'Strawberry Bliss');
  assert.equal(historical.items[0].unitPrice, 68000);
});
test('sessions survive a new store instance and expired sessions are absent', async () => {
  await transaction((tx) =>
    tx.session.create({
      data: {
        sid: 'test-persist',
        data: JSON.stringify({ userId: 2 }),
        expiresAt: new Date(Date.now() + 60000),
      },
    }),
  );
  const sessionStore = new DatabaseSessionStore();
  assert.equal(
    (
      await new Promise<any>((r, j) =>
        sessionStore.get('test-persist', (e, d) => (e ? j(e) : r(d))),
      )
    ).userId,
    2,
  );
  await transaction((tx) =>
    tx.session.update({ where: { sid: 'test-persist' }, data: { expiresAt: new Date(0) } }),
  );
  assert.equal(
    await new Promise<any>((r, j) => sessionStore.get('test-persist', (e, d) => (e ? j(e) : r(d)))),
    null,
  );
});
test('logout invalidates the session', async () => {
  assert.equal((await mutate(other, 'post', '/api/auth/logout', otherToken)).status, 204);
  assert.equal((await other.get('/api/auth/me')).status, 401);
});
test('registration normalizes email and rejects duplicate accounts', async () => {
  const newUser = request.agent(app);
  const token = (await newUser.get('/api/auth/csrf')).body.data.csrfToken;
  const payload = { name: 'A new creator', email: '  NEW@sistabrew.TEST  ', password };
  assert.equal(
    (await mutate(newUser, 'post', '/api/auth/register', token).send(payload)).status,
    201,
  );
  assert.equal(
    (
      await mutate(newUser, 'post', '/api/auth/register', token).send({
        ...payload,
        email: 'new@sistabrew.test',
      })
    ).status,
    409,
  );
  assert.equal(
    (await db.user.findUnique({ where: { email: 'new@sistabrew.test' } })).role,
    'CUSTOMER',
  );
});
test('persistent login throttle returns Retry-After on the sixth failure', async () => {
  const agent = request.agent(app);
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await mutate(agent, 'post', '/api/auth/login', token).send({
          email: 'missing@sistabrew.test',
          password,
        })
      ).status,
      401,
    );
  const blocked = await mutate(agent, 'post', '/api/auth/login', token).send({
    email: 'missing@sistabrew.test',
    password,
  });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
});
test('parallel cancellation and upload cannot leave a pending proof on a cancelled order', async () => {
  const o = (await order()).body.data;
  const image = await sharp({
    create: { width: 12, height: 12, channels: 3, background: '#ffe0ef' },
  })
    .png()
    .toBuffer();
  const results = await Promise.all([
    mutate(customer, 'post', `/api/orders/${o.id}/cancel`, customerToken),
    mutate(customer, 'post', `/api/orders/${o.id}/payments`, customerToken)
      .set('Idempotency-Key', randomUUID())
      .attach('file', image, 'proof.png'),
  ]);
  assert.equal(results.filter((r) => r.status < 300).length, 1);
  const final = (await customer.get(`/api/orders/${o.id}`)).body.data;
  assert.ok(
    final.status === 'CANCELLED' ? final.payments.length === 0 : final.payments.length === 1,
  );
});
test('oversized upload and Unicode CSRF tokens fail safely', async () => {
  const o = (await order()).body.data;
  const result = await mutate(customer, 'post', `/api/orders/${o.id}/payments`, customerToken)
    .set('Idempotency-Key', randomUUID())
    .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1), 'huge.png');
  assert.equal(result.status, 413);
  const invalid = await customer
    .post('/api/orders')
    .set('Origin', origin)
    .set('X-CSRF-Token', 'é'.repeat(customerToken.length))
    .send(body());
  assert.equal(invalid.status, 403);
});
