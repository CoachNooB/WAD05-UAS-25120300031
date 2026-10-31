// Explicit integration gate. Uses ONLY TEST_DATABASE_URL, which must be disposable.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
if (!process.env.TEST_DATABASE_URL) {
  console.error('Set TEST_DATABASE_URL to a migrated, disposable TiDB database.');
  process.exit(1);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db, transaction } = await import('./database.js');
const { checkout, cancelOrder } = await import('./services.js');
const { DatabaseSessionStore } = await import('./session.js');
const marker = randomUUID();
let user: any, category: any, product: any;
try {
  user = await db.user.create({
    data: {
      name: 'Integration gate',
      email: `gate-${marker}@sistabrew.test`,
      passwordHash: 'unused-test-account',
      role: 'CUSTOMER',
    },
  });
  category = await db.category.create({ data: { name: `Gate ${marker}` } });
  product = await db.product.create({
    data: {
      name: 'Gate product',
      sku: `GATE-${marker}`,
      categoryId: category.id,
      description: 'Disposable integration fixture',
      price: 1000,
      stock: 1,
      isActive: true,
    },
  });
  await assert.rejects(
    () =>
      db.product.create({
        data: {
          name: 'Invalid FK',
          sku: `BAD-${marker}`,
          categoryId: 2147483647,
          description: 'Must fail',
          price: 1,
          stock: 1,
          isActive: true,
        },
      }),
    { code: 'P2003' },
  );
  await assert.rejects(
    () =>
      transaction(async (tx) => {
        await tx.product.update({ where: { id: product.id }, data: { stock: 0 } });
        throw new Error('Rollback sentinel');
      }),
    /Rollback sentinel/,
  );
  assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 1);
  const body = {
    items: [{ productId: product.id, quantity: 1 }],
    fulfillmentMethod: 'PICKUP',
    recipientName: 'Gate',
    recipientPhone: '081234567890',
  };
  const attempts = await Promise.allSettled([
    checkout(user, body, randomUUID()),
    checkout(user, body, randomUUID()),
  ]);
  assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
  assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 0);
  const created: any = (
    attempts.find((a) => a.status === 'fulfilled') as PromiseFulfilledResult<any>
  ).value.order;
  await cancelOrder(created.id, user);
  await cancelOrder(created.id, user);
  assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 1);
  const sessionStore = new DatabaseSessionStore();
  const sid = `gate-${marker}`;
  await new Promise<void>((r, j) =>
    sessionStore.set(sid, { cookie: {}, userId: user.id }, (e) => (e ? j(e) : r())),
  );
  assert.equal(
    (
      await new Promise<any>((r, j) =>
        new DatabaseSessionStore().get(sid, (e, s) => (e ? j(e) : r(s))),
      )
    ).userId,
    user.id,
  );
  await new Promise<void>((r, j) => sessionStore.destroy(sid, (e) => (e ? j(e) : r())));
  assert.equal(
    await new Promise<any>((r, j) => sessionStore.get(sid, (e, s) => (e ? j(e) : r(s)))),
    null,
  );
  console.log(
    'PASS: foreign keys, rollback, concurrent stock reservation, cancellation replay, persistent session CRUD.',
  );
} finally {
  // Remove only fixtures created by this invocation, in dependency order.
  if (user) {
    const orders = await db.order.findMany({ where: { userId: user.id } });
    for (const o of orders) {
      await db.orderItem.deleteMany({ where: { orderId: o.id } });
      await db.order.delete({ where: { id: o.id } });
    }
  }
  if (product) await db.product.delete({ where: { id: product.id } });
  if (category) await db.category.delete({ where: { id: category.id } });
  if (user) await db.user.delete({ where: { id: user.id } });
  await db.session.deleteMany({ where: { sid: `gate-${marker}` } });
  await db.$disconnect();
}
