// Single-process, local-only demo repository. Production always uses Prisma/TiDB.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
const models = [
  'user',
  'category',
  'product',
  'order',
  'orderItem',
  'payment',
  'session',
  'authRateLimit',
  'storageCleanup',
];
function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    if (k === 'OR') return v.some((w: any) => matches(row, w));
    if (k === 'AND') return v.every((w: any) => matches(row, w));
    if (k.includes('_') && !(k in row)) return matches(row, v);
    const actual = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      return Object.entries(v).every(([op, val]: [string, any]) =>
        op === 'gte'
          ? actual >= val
          : op === 'lte'
            ? actual <= val
            : op === 'lt'
              ? actual < val
              : op === 'gt'
                ? actual > val
                : op === 'in'
                  ? val.includes(actual)
                  : op === 'contains'
                    ? String(actual).toLowerCase().includes(String(val).toLowerCase())
                    : op === 'not'
                      ? actual !== val
                      : actual === val,
      );
    }
    return actual === v;
  });
}
export async function demoDatabase(file = resolve('.data/demo.json')): Promise<any> {
  let state: Record<string, any[]> = Object.fromEntries(models.map((m) => [m, []]));
  try {
    state = JSON.parse(await readFile(file, 'utf8'), (k, v) =>
      /At$/.test(k) && v ? new Date(v) : v,
    );
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
  let tail = Promise.resolve();
  const persist = async () => {
    await mkdir(resolve(file, '..'), { recursive: true });
    await writeFile(file + '.tmp', JSON.stringify(state));
    await rename(file + '.tmp', file);
  };
  const db: any = {};
  for (const model of models) {
    db[model] = {
      findMany: async ({ where, orderBy, skip = 0, take }: any = {}) => {
        let rows = state[model].filter((r) => matches(r, where));
        if (orderBy) {
          const [key, dir] = Object.entries(orderBy)[0];
          rows.sort(
            (a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (dir === 'desc' ? -1 : 1),
          );
        }
        return structuredClone(rows.slice(skip, take === undefined ? undefined : skip + take));
      },
      findFirst: async ({ where }: any = {}) =>
        structuredClone(state[model].find((r) => matches(r, where)) || null),
      findUnique: async ({ where }: any) =>
        structuredClone(state[model].find((r) => matches(r, where)) || null),
      count: async ({ where }: any = {}) => state[model].filter((r) => matches(r, where)).length,
      create: async ({ data }: any) => {
        const row = {
          id: Math.max(0, ...state[model].map((r) => r.id || 0)) + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(model === 'order'
            ? { version: 0, status: 'AWAITING_PAYMENT', stockRestoredAt: null, completedAt: null }
            : {}),
          ...(model === 'payment'
            ? {
                status: 'PENDING_REVIEW',
                submittedAt: new Date(),
                reviewedAt: null,
                rejectionReason: null,
              }
            : {}),
          ...data,
        };
        const uniques: Record<string, string[][]> = {
          user: [['email']],
          category: [['name']],
          product: [['sku']],
          order: [['orderNumber'], ['userId', 'checkoutKey']],
          payment: [['orderId', 'submissionKey']],
          session: [['sid']],
          authRateLimit: [['keyHash']],
        };
        if (
          (uniques[model] || []).some((keys) =>
            state[model].some((r) =>
              keys.every((k) => String(r[k]).toLowerCase() === String(row[k]).toLowerCase()),
            ),
          )
        )
          throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
        state[model].push(row);
        return structuredClone(row);
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of state[model].filter((r) => matches(r, where))) {
          for (const [key, val] of Object.entries(data) as any) {
            row[key] =
              val && typeof val === 'object' && 'increment' in val
                ? row[key] + val.increment
                : val && typeof val === 'object' && 'decrement' in val
                  ? row[key] - val.decrement
                  : val;
          }
          row.updatedAt = new Date();
          count++;
        }
        return { count };
      },
      update: async (args: any) => {
        const row = await db[model].findUnique({ where: args.where });
        if (!row) throw Object.assign(new Error('Missing'), { code: 'P2025' });
        await db[model].updateMany(args);
        return db[model].findUnique({ where: args.where });
      },
      delete: async ({ where }: any) => {
        const index = state[model].findIndex((r) => matches(r, where));
        if (index < 0) throw Object.assign(new Error('Missing'), { code: 'P2025' });
        return state[model].splice(index, 1)[0];
      },
      deleteMany: async ({ where }: any = {}) => {
        const before = state[model].length;
        state[model] = state[model].filter((r) => !matches(r, where));
        return { count: before - state[model].length };
      },
      upsert: async ({ where, create, update }: any) =>
        (await db[model].findUnique({ where }))
          ? db[model].update({ where, data: update })
          : db[model].create({ data: create }),
    };
  }
  db.$transaction = async (fn: any) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise((r) => (release = r));
    await previous;
    const backup = structuredClone(state);
    try {
      const result = await fn(db);
      await persist();
      return result;
    } catch (e) {
      state = backup;
      throw e;
    } finally {
      release();
    }
  };
  db.$disconnect = async () => {};
  return db;
}
