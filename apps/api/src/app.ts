import express, { type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import multer from 'multer';
import { hashPassword, verifyPassword } from './passwords.js';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import {
  loginSchema,
  registerSchema,
  categorySchema,
  productSchema,
  statuses,
} from '@sistabrew/shared';
import { db, transaction } from './database.js';
import { production, localDemo, origins, cookie, cookieName, store } from './config.js';
import { DatabaseSessionStore } from './session.js';
import {
  Fault,
  requireThat,
  digest,
  key,
  checkout,
  orderDetail,
  cancelOrder,
  transitionOrder,
  submitPayment,
  reviewPayment,
} from './services.js';
import { uploadImage, removeImage, imageUrl, localImage } from './storage.js';
export const app = express();
app.disable('x-powered-by');
// Trust only the immediate deployment proxy; IP throttling is intentionally disabled
// until the target Vercel rewrite path's IP behavior has been verified.
if (production) app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.locals.requestId = randomUUID();
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(
  session({
    name: cookieName,
    secret: process.env.SESSION_SECRET || 'local-demo-only-session-secret-not-for-production',
    store: new DatabaseSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie,
  }),
);
app.use(async (req, res, next) => {
  try {
    if (req.session.absoluteExpiresAt && Date.now() >= req.session.absoluteExpiresAt) {
      await new Promise<void>((r, j) => req.session.destroy((e) => (e ? j(e) : r())));
      res.clearCookie(cookieName, cookie);
      throw new Fault(401, 'SESSION_EXPIRED', 'Your session expired. Please sign in again.');
    }
    if (req.session.absoluteExpiresAt)
      req.session.cookie.maxAge = Math.min(7200000, req.session.absoluteExpiresAt - Date.now());
    if (req.session.userId) {
      const user = await db.user.findUnique({ where: { id: req.session.userId } });
      if (user) {
        const { passwordHash, ...safe } = user;
        res.locals.user = safe;
      }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const token = req.get('X-CSRF-Token') || '';
      const expected = req.session.csrfToken || '';
      requireThat(
        origins.includes(req.get('Origin') || ''),
        'ORIGIN_DENIED',
        'Request origin is not allowed.',
        403,
      );
      requireThat(
        Buffer.byteLength(token) === Buffer.byteLength(expected) &&
          token.length > 0 &&
          timingSafeEqual(Buffer.from(token), Buffer.from(expected)),
        'CSRF_INVALID',
        'Your security token expired. Refresh and retry.',
        403,
      );
    }
    next();
  } catch (e) {
    next(e);
  }
});
const auth = (req: Request, res: Response, next: NextFunction) =>
  res.locals.user ? next() : next(new Fault(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
const admin = (req: Request, res: Response, next: NextFunction) =>
  res.locals.user?.role === 'ADMIN'
    ? next()
    : next(new Fault(res.locals.user ? 403 : 401, 'FORBIDDEN', 'Administrator access required.'));
const id = (req: Request, name = 'id') =>
  z.coerce.number().int().positive().parse(req.params[name]);
const ok = (res: Response, data: any, status = 200) => res.status(status).json({ data });
const paging = (req: Request) => ({
  page: z.coerce.number().int().min(1).default(1).parse(req.query.page),
  pageSize: z.coerce.number().int().min(1).max(50).default(20).parse(req.query.pageSize),
});
async function page(
  res: Response,
  req: Request,
  model: string,
  where: any,
  orderBy: any,
  transform = (r: any) => r,
) {
  const { page, pageSize } = paging(req);
  const [rows, total] = await Promise.all([
    db[model].findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db[model].count({ where }),
  ]);
  res.json({ data: await Promise.all(rows.map(transform)), meta: { page, pageSize, total } });
}
async function productDTO(p: any) {
  const { imagePath, ...safe } = p;
  const image = imagePath ? await imageUrl(imagePath) : null;
  return {
    ...safe,
    category: await db.category.findUnique({ where: { id: p.categoryId } }),
    imageUrl: localDemo && imagePath ? `/api/products/${p.id}/image` : image?.url,
    imageUrlExpiresAt: image?.expiresAt,
  };
}
app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }));
app.get('/api/store', (_req, res) => {
  const { bank, ...safe } = store;
  ok(res, safe);
});
app.get('/api/auth/csrf', (req, res) => {
  req.session.csrfToken ||= randomBytes(32).toString('hex');
  ok(res, { csrfToken: req.session.csrfToken });
});
app.get('/api/auth/me', auth, (_req, res) => ok(res, res.locals.user));
app.post('/api/auth/register', async (req, res) => {
  const body = registerSchema.parse(req.body);
  const passwordHash = await hashPassword(body.password);
  const { password, ...safe } = body;
  const user: any = await transaction((tx) =>
    tx.user.create({ data: { ...safe, passwordHash, role: 'CUSTOMER' } }),
  );
  const { passwordHash: _, ...result } = user;
  ok(res, result, 201);
});
app.post('/api/auth/login', async (req, res) => {
  const body = loginSchema.parse(req.body);
  const keyHash = digest(`email:${body.email}`);
  const rate = await db.authRateLimit.findUnique({ where: { keyHash } });
  if (rate && rate.expiresAt > new Date() && rate.attempts >= 5) {
    res.set('Retry-After', String(Math.ceil((rate.expiresAt.getTime() - Date.now()) / 1000)));
    throw new Fault(429, 'RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.');
  }
  const user = await db.user.findUnique({ where: { email: body.email } });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    await transaction(async (tx) => {
      const old = await tx.authRateLimit.findUnique({ where: { keyHash } });
      if (old && old.expiresAt > new Date())
        await tx.authRateLimit.update({ where: { keyHash }, data: { attempts: { increment: 1 } } });
      else {
        await tx.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        requireThat(
          (await tx.authRateLimit.count()) < 10000,
          'RATE_LIMITED',
          'Please try signing in later.',
          429,
        );
        await tx.authRateLimit.upsert({
          where: { keyHash },
          create: { keyHash, attempts: 1, expiresAt: new Date(Date.now() + 900000) },
          update: { attempts: 1, expiresAt: new Date(Date.now() + 900000) },
        });
      }
    });
    throw new Fault(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
  req.session.userId = user.id;
  req.session.authenticatedAt = Date.now();
  req.session.absoluteExpiresAt = Date.now() + 43200000;
  req.session.csrfToken = randomBytes(32).toString('hex');
  await new Promise<void>((r, j) => req.session.save((e) => (e ? j(e) : r())));
  const { passwordHash, ...safe } = user;
  ok(res, { user: safe, csrfToken: req.session.csrfToken });
});
app.post('/api/auth/logout', auth, async (req, res) => {
  await new Promise<void>((r, j) => req.session.destroy((e) => (e ? j(e) : r())));
  res.clearCookie(cookieName, { ...cookie, maxAge: undefined });
  res.status(204).end();
});
app.get('/api/categories', async (_req, res) =>
  ok(res, await db.category.findMany({ orderBy: { name: 'asc' } })),
);
const listProducts =
  (all = false) =>
  async (req: Request, res: Response) => {
    const q = z.string().max(100).optional().parse(req.query.q);
    const categoryId = req.query.categoryId
      ? z.coerce.number().int().positive().parse(req.query.categoryId)
      : undefined;
    const sort = z
      .enum(['nameAsc', 'priceAsc', 'priceDesc', 'newest'])
      .default('newest')
      .parse(req.query.sort);
    const sorts: any = {
      nameAsc: { name: 'asc' },
      priceAsc: { price: 'asc' },
      priceDesc: { price: 'desc' },
      newest: { createdAt: 'desc' },
    };
    const where: any = {
      ...(!all ? { isActive: true } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { description: { contains: q } }] } : {}),
      ...(categoryId ? { categoryId } : {}),
    };
    if (all && req.query.isActive !== undefined)
      where.isActive = z.enum(['true', 'false']).parse(req.query.isActive) === 'true';
    await page(res, req, 'product', where, sorts[sort], productDTO);
  };
app.get('/api/products', listProducts());
app.get('/api/admin/products', admin, listProducts(true));
app.get('/api/products/:id', async (req, res) => {
  const p = await db.product.findFirst({ where: { id: id(req), isActive: true } });
  requireThat(p, 'NOT_FOUND', 'Product not found.', 404);
  ok(res, await productDTO(p));
});
app.get('/api/products/:id/image', async (req, res) => {
  const p = await db.product.findFirst({ where: { id: id(req), isActive: true } });
  requireThat(localDemo && p?.imagePath, 'NOT_FOUND', 'Image not found.', 404);
  res.type('webp').send(await localImage(p.imagePath));
});
app.use('/api/admin', admin);
app.get('/api/admin/products/:id', async (req, res) => {
  const p = await db.product.findUnique({ where: { id: id(req) } });
  requireThat(p, 'NOT_FOUND', 'Product not found.', 404);
  ok(res, await productDTO(p));
});
app.post('/api/admin/products', async (req, res) => {
  const body = productSchema.parse(req.body);
  requireThat(
    await db.category.findUnique({ where: { id: body.categoryId } }),
    'VALIDATION_ERROR',
    'Choose an existing category.',
    422,
  );
  ok(res, await productDTO(await transaction((tx) => tx.product.create({ data: body }))), 201);
});
app.patch('/api/admin/products/:id', async (req, res) => {
  const body = productSchema.omit({ stock: true }).partial().parse(req.body);
  if (body.categoryId)
    requireThat(
      await db.category.findUnique({ where: { id: body.categoryId } }),
      'VALIDATION_ERROR',
      'Choose an existing category.',
      422,
    );
  ok(
    res,
    await productDTO(
      await transaction((tx) => tx.product.update({ where: { id: id(req) }, data: body })),
    ),
  );
});
app.post('/api/admin/products/:id/stock-adjustments', async (req, res) => {
  const { delta } = z
    .object({
      delta: z
        .number()
        .int()
        .min(-1000000)
        .max(1000000)
        .refine((v) => v !== 0),
    })
    .strict()
    .parse(req.body);
  await transaction(async (tx) => {
    const change = await tx.product.updateMany({
      where: { id: id(req), stock: delta < 0 ? { gte: -delta } : { lte: 1000000 - delta } },
      data: { stock: { increment: delta } },
    });
    requireThat(change.count === 1, 'INVALID_STOCK', 'Stock must stay between 0 and 1,000,000.');
  });
  ok(res, await productDTO(await db.product.findUnique({ where: { id: id(req) } })));
});
app.delete('/api/admin/products/:id', async (req, res) => {
  await transaction(async (tx) => {
    requireThat(
      !(await tx.orderItem.count({ where: { productId: id(req) } })),
      'PRODUCT_IN_USE',
      'This product has order history. Deactivate it instead.',
    );
    await tx.product.delete({ where: { id: id(req) } });
  });
  res.status(204).end();
});
app.get('/api/admin/categories/:id', async (req, res) => {
  const c = await db.category.findUnique({ where: { id: id(req) } });
  requireThat(c, 'NOT_FOUND', 'Category not found.', 404);
  ok(res, c);
});
app.post('/api/admin/categories', async (req, res) =>
  ok(
    res,
    await transaction((tx) => tx.category.create({ data: categorySchema.parse(req.body) })),
    201,
  ),
);
app.patch('/api/admin/categories/:id', async (req, res) =>
  ok(
    res,
    await transaction((tx) =>
      tx.category.update({
        where: { id: id(req) },
        data: categorySchema.partial().parse(req.body),
      }),
    ),
  ),
);
app.delete('/api/admin/categories/:id', async (req, res) => {
  await transaction(async (tx) => {
    requireThat(
      !(await tx.product.count({ where: { categoryId: id(req) } })),
      'CATEGORY_IN_USE',
      'Remove or move the products in this category first.',
    );
    await tx.category.delete({ where: { id: id(req) } });
  });
  res.status(204).end();
});
app.post('/api/orders', auth, async (req, res) => {
  requireThat(
    res.locals.user.role === 'CUSTOMER',
    'FORBIDDEN',
    'Use a customer account to place an order.',
    403,
  );
  const result = await checkout(res.locals.user, req.body, key(req.get('Idempotency-Key')));
  ok(res, result.order, result.replay ? 200 : 201);
});
app.get('/api/orders', auth, async (req, res) => {
  const status = req.query.status ? z.enum(statuses).parse(req.query.status) : undefined;
  await page(
    res,
    req,
    'order',
    { userId: res.locals.user.id, ...(status ? { status } : {}) },
    { createdAt: 'desc' },
    (r) => orderDetail(db, r.id, res.locals.user),
  );
});
app.get('/api/orders/:id', auth, async (req, res) =>
  ok(res, await orderDetail(db, id(req), res.locals.user)),
);
app.post('/api/orders/:id/cancel', auth, async (req, res) =>
  ok(res, await cancelOrder(id(req), res.locals.user)),
);
app.get('/api/admin/orders', async (req, res) => {
  const where: any = {};
  if (req.query.status) where.status = z.enum(statuses).parse(req.query.status);
  if (req.query.method)
    where.fulfillmentMethod = z.enum(['PICKUP', 'LOCAL_DELIVERY']).parse(req.query.method);
  if (req.query.q) where.orderNumber = { contains: z.string().max(100).parse(req.query.q) };
  await page(res, req, 'order', where, { createdAt: 'desc' }, (r) =>
    orderDetail(db, r.id, res.locals.user),
  );
});
app.get('/api/admin/orders/:id', async (req, res) =>
  ok(res, await orderDetail(db, id(req), res.locals.user)),
);
app.patch('/api/admin/orders/:id/status', async (req, res) => {
  const { status } = z
    .object({ status: z.enum(statuses) })
    .strict()
    .parse(req.body);
  ok(res, await transitionOrder(id(req), status, res.locals.user));
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
}).single('file');
app.put('/api/admin/products/:id/image', upload, async (req, res) => {
  const p = await db.product.findUnique({ where: { id: id(req) } });
  requireThat(p, 'NOT_FOUND', 'Product not found.', 404);
  requireThat(req.file, 'VALIDATION_ERROR', 'Choose an image.', 422);
  const stored = await uploadImage(`products/${p.id}`, req.file.buffer);
  try {
    await transaction((tx) =>
      tx.product.update({ where: { id: p.id }, data: { imagePath: stored.path } }),
    );
  } catch (e) {
    await removeImage(stored.path);
    throw e;
  }
  if (p.imagePath) await removeImage(p.imagePath);
  ok(res, await productDTO(await db.product.findUnique({ where: { id: p.id } })));
});
app.post(
  '/api/orders/:id/payments',
  auth,
  async (req, res, next) => {
    try {
      await orderDetail(db, id(req), res.locals.user);
      next();
    } catch (e) {
      next(e);
    }
  },
  upload,
  async (req, res) => {
    const submissionKey = key(req.get('Idempotency-Key'));
    requireThat(req.file, 'VALIDATION_ERROR', 'Choose a payment proof image.', 422);
    const stored = await uploadImage(`payment-proofs/${id(req)}`, req.file.buffer);
    try {
      const result = await submitPayment(
        id(req),
        res.locals.user,
        stored.path,
        stored.hash,
        submissionKey,
      );
      if (result.replay) await removeImage(stored.path);
      const { proofPath, proofSha256, submissionKey: _, ...safe } = result.payment;
      ok(res, safe, result.replay ? 200 : 201);
    } catch (e) {
      await removeImage(stored.path);
      throw e;
    }
  },
);
app.get('/api/admin/payments', async (req, res) => {
  const status = z
    .enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED'])
    .default('PENDING_REVIEW')
    .parse(req.query.status);
  await page(res, req, 'payment', { status }, { submittedAt: 'desc' }, async (p) => {
    const { proofPath, proofSha256, submissionKey, ...safe } = p;
    return { ...safe, order: await orderDetail(db, p.orderId, res.locals.user) };
  });
});
app.post('/api/admin/payments/:id/approve', async (req, res) =>
  ok(res, await reviewPayment(id(req), true, '', res.locals.user)),
);
app.post('/api/admin/payments/:id/reject', async (req, res) => {
  const { rejectionReason } = z
    .object({ rejectionReason: z.string().trim().min(1).max(1000) })
    .strict()
    .parse(req.body);
  ok(res, await reviewPayment(id(req), false, rejectionReason, res.locals.user));
});
app.get('/api/payments/:id/proof-url', auth, async (req, res) => {
  const p = await db.payment.findUnique({ where: { id: id(req) } });
  requireThat(p, 'NOT_FOUND', 'Payment not found.', 404);
  await orderDetail(db, p.orderId, res.locals.user);
  ok(
    res,
    localDemo
      ? { url: `/api/payments/${p.id}/proof`, expiresAt: null }
      : await imageUrl(p.proofPath, 60),
  );
});
app.get('/api/payments/:id/proof', auth, async (req, res) => {
  const p = await db.payment.findUnique({ where: { id: id(req) } });
  requireThat(localDemo && p, 'NOT_FOUND', 'Proof not found.', 404);
  await orderDetail(db, p.orderId, res.locals.user);
  res.type('webp').send(await localImage(p.proofPath));
});
app.use((_req, res) =>
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Endpoint not found.', requestId: res.locals.requestId },
  }),
);
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  let status = 500,
    code = 'INTERNAL_ERROR',
    message = 'Something went wrong. Please try again.';
  let fields: any;
  if (error instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = error.issues[0]?.message || 'Check submitted fields.';
    fields = z.flattenError(error).fieldErrors;
  } else if (error instanceof Fault) {
    ({ status, code, message } = error);
  } else if (error.code === 'P2002') {
    status = 409;
    code = 'ALREADY_EXISTS';
    message = 'That email, name, or SKU already exists.';
  } else if (error.code === 'P2003') {
    status = 409;
    code = 'REFERENCE_IN_USE';
    message = 'This record is referenced by another record.';
  } else if (error.code === 'P2025') {
    status = 404;
    code = 'NOT_FOUND';
    message = 'Record not found.';
  } else if (error instanceof multer.MulterError) {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
    code = 'UPLOAD_ERROR';
    message = 'Choose one image no larger than 2 MiB.';
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON.';
  } else {
    console.error('Request failed', {
      requestId: res.locals.requestId,
      code: error.code || error.name,
    });
  }
  res.status(status).json({ error: { code, message, fields, requestId: res.locals.requestId } });
});

export default app;
