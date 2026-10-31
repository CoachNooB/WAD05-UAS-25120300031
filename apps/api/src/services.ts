import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkoutSchema, nextStatuses } from '@sistabrew/shared';
import { db, transaction } from './database.js';
import { store } from './config.js';
export class Fault extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function requireThat(
  condition: any,
  code: string,
  message: string,
  status = 409,
): asserts condition {
  if (!condition) throw new Fault(status, code, message);
}
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const key = (value: unknown) => z.uuid().parse(value);
export async function orderDetail(tx: any, id: number, user: any) {
  const order = await tx.order.findUnique({ where: { id } });
  requireThat(
    order && (user.role === 'ADMIN' || order.userId === user.id),
    'NOT_FOUND',
    'Order not found.',
    404,
  );
  const items = await tx.orderItem.findMany({ where: { orderId: id } });
  const payments = await tx.payment.findMany({
    where: { orderId: id },
    orderBy: { submittedAt: 'desc' },
  });
  const { checkoutHash, checkoutKey, ...safe } = order;
  return {
    ...safe,
    items,
    payments: payments.map(({ proofPath, proofSha256, submissionKey, ...p }: any) => p),
    bank: order.status === 'AWAITING_PAYMENT' ? store.bank : undefined,
  };
}
export async function guard(tx: any, id: number) {
  const order = await tx.order.findUnique({ where: { id } });
  requireThat(order, 'NOT_FOUND', 'Order not found.', 404);
  const result = await tx.order.updateMany({
    where: { id, version: order.version },
    data: { version: { increment: 1 } },
  });
  requireThat(result.count === 1, 'ORDER_CONFLICT', 'Order changed. Refresh and try again.');
  return order;
}
export async function checkout(user: any, raw: any, idempotencyKey: string) {
  const body = checkoutSchema.parse(raw);
  body.items.sort((a, b) => a.productId - b.productId);
  const hash = digest(JSON.stringify(body));
  const replay = async () => {
    const old = await db.order.findUnique({
      where: { userId_checkoutKey: { userId: user.id, checkoutKey: idempotencyKey } },
    });
    if (!old) return null;
    requireThat(
      old.checkoutHash === hash,
      'IDEMPOTENCY_CONFLICT',
      'This checkout key was used with different details.',
    );
    return orderDetail(db, old.id, user);
  };
  const old = await replay();
  if (old) return { order: old, replay: true };
  try {
    return await transaction(async (tx) => {
      const items = [];
      let subtotal = 0;
      for (const item of body.items) {
        const p = await tx.product.findUnique({ where: { id: item.productId } });
        requireThat(p && p.isActive, 'PRODUCT_UNAVAILABLE', 'An item is no longer available.');
        const changed = await tx.product.updateMany({
          where: { id: p.id, isActive: true, price: p.price, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        requireThat(
          changed.count === 1,
          'INSUFFICIENT_STOCK',
          `${p.name} has insufficient stock or its price changed.`,
        );
        items.push({
          productId: p.id,
          productName: p.name,
          unitPrice: p.price,
          quantity: item.quantity,
          lineTotal: p.price * item.quantity,
        });
        subtotal += p.price * item.quantity;
      }
      const deliveryFee = body.fulfillmentMethod === 'PICKUP' ? 0 : store.deliveryFee;
      requireThat(
        subtotal + deliveryFee <= 1000000000,
        'TOTAL_TOO_LARGE',
        'Order total is too large.',
      );
      const { items: _, ...details } = body;
      const order = await tx.order.create({
        data: {
          ...details,
          userId: user.id,
          orderNumber: `HS-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          subtotal,
          deliveryFee,
          total: subtotal + deliveryFee,
          checkoutKey: idempotencyKey,
          checkoutHash: hash,
        },
      });
      for (const item of items) await tx.orderItem.create({ data: { ...item, orderId: order.id } });
      return { order: await orderDetail(tx, order.id, user), replay: false };
    });
  } catch (e: any) {
    if (e.code === 'P2002') {
      const existing = await replay();
      if (existing) return { order: existing, replay: true };
    }
    throw e;
  }
}
export async function cancelOrder(id: number, user: any) {
  return transaction(async (tx) => {
    await orderDetail(tx, id, user);
    const order = await guard(tx, id);
    if (order.status === 'CANCELLED') return orderDetail(tx, id, user);
    requireThat(
      order.status === 'AWAITING_PAYMENT' && !order.stockRestoredAt,
      'INVALID_ORDER_STATE',
      'This order cannot be cancelled.',
    );
    requireThat(
      !(await tx.payment.count({
        where: { orderId: id, status: { in: ['PENDING_REVIEW', 'APPROVED'] } },
      })),
      'PAYMENT_BLOCKS_CANCELLATION',
      'Payment must be reviewed before cancellation.',
    );
    for (const item of await tx.orderItem.findMany({ where: { orderId: id } }))
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    await tx.order.update({
      where: { id },
      data: { status: 'CANCELLED', stockRestoredAt: new Date() },
    });
    return orderDetail(tx, id, user);
  });
}
export async function transitionOrder(id: number, status: string, user: any) {
  return transaction(async (tx) => {
    const order = await guard(tx, id);
    requireThat(
      nextStatuses(order.status, order.fulfillmentMethod).includes(status),
      'INVALID_ORDER_STATE',
      'That transition is not allowed.',
    );
    await tx.order.update({
      where: { id },
      data: { status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
    });
    return orderDetail(tx, id, user);
  });
}
export async function submitPayment(
  id: number,
  user: any,
  path: string,
  hash: string,
  submissionKey: string,
) {
  return transaction(async (tx) => {
    await orderDetail(tx, id, user);
    const order = await guard(tx, id);
    requireThat(order.userId === user.id, 'NOT_FOUND', 'Order not found.', 404);
    const existing = await tx.payment.findUnique({
      where: { orderId_submissionKey: { orderId: id, submissionKey } },
    });
    if (existing) {
      requireThat(
        existing.proofSha256 === hash,
        'IDEMPOTENCY_CONFLICT',
        'This key was used with a different file.',
      );
      return { payment: existing, replay: true };
    }
    requireThat(
      order.status === 'AWAITING_PAYMENT',
      'INVALID_ORDER_STATE',
      'This order is not awaiting payment.',
    );
    requireThat(
      !(await tx.payment.count({
        where: { orderId: id, status: { in: ['PENDING_REVIEW', 'APPROVED'] } },
      })),
      'PAYMENT_EXISTS',
      'A payment is already awaiting review or approved.',
    );
    return {
      payment: await tx.payment.create({
        data: {
          orderId: id,
          amount: order.total,
          proofPath: path,
          proofSha256: hash,
          submissionKey,
        },
      }),
      replay: false,
    };
  });
}
export async function reviewPayment(id: number, approve: boolean, reason: string, user: any) {
  return transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id } });
    requireThat(payment, 'NOT_FOUND', 'Payment not found.', 404);
    const order = await guard(tx, payment.orderId);
    if (approve && payment.status === 'APPROVED') return { id, status: 'APPROVED' };
    if (!approve && payment.status === 'REJECTED' && payment.rejectionReason === reason)
      return { id, status: 'REJECTED' };
    requireThat(
      payment.status === 'PENDING_REVIEW' &&
        order.status === 'AWAITING_PAYMENT' &&
        payment.amount === order.total,
      'INVALID_PAYMENT_STATE',
      'Payment cannot be reviewed in its current state.',
    );
    const status = approve ? 'APPROVED' : 'REJECTED';
    await tx.payment.update({
      where: { id },
      data: {
        status,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        rejectionReason: approve ? null : reason,
      },
    });
    if (approve) await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    return { id, status };
  });
}
