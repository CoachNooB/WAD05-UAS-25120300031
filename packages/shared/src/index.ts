import { z } from 'zod';
export const statuses = [
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELLED',
] as const;
export const phone = z
  .string()
  .trim()
  .max(30)
  .refine(
    (v) =>
      /^[+\d\s()-]+$/.test(v) &&
      v.replace(/\D/g, '').length >= 9 &&
      v.replace(/\D/g, '').length <= 15,
    'Enter a valid phone number.',
  );
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine(
        (v) => new TextEncoder().encode(v).length <= 72,
        'Password must be at most 72 UTF-8 bytes.',
      ),
  })
  .strict();
export const registerSchema = loginSchema
  .extend({ name: z.string().trim().min(1).max(100), phone: phone.optional() })
  .strict();
export const categorySchema = z
  .object({ name: z.string().trim().min(1).max(100), description: z.string().max(2000).optional() })
  .strict();
export const productSchema = z
  .object({
    categoryId: z.number().int().positive(),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(1).max(150),
    description: z.string().max(5000),
    price: z.number().int().min(1).max(10000000),
    stock: z.number().int().min(0).max(1000000),
    isActive: z.boolean(),
  })
  .strict();
export const checkoutSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.number().int().positive(),
            quantity: z.number().int().min(1).max(99),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    fulfillmentMethod: z.enum(['PICKUP', 'LOCAL_DELIVERY']),
    recipientName: z.string().trim().min(1).max(100),
    recipientPhone: phone,
    deliveryAddress: z.string().trim().max(1000).optional(),
    customerNotes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.items.map((i) => i.productId)).size !== v.items.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate products are not allowed.',
        path: ['items'],
      });
    if (
      v.fulfillmentMethod === 'LOCAL_DELIVERY' &&
      (!v.deliveryAddress || v.deliveryAddress.length < 10)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a complete delivery address.',
        path: ['deliveryAddress'],
      });
  });
export function nextStatuses(status: string, method: string): string[] {
  return (
    (
      {
        CONFIRMED: ['PROCESSING'],
        PROCESSING: [method === 'PICKUP' ? 'READY_FOR_PICKUP' : 'OUT_FOR_DELIVERY'],
        READY_FOR_PICKUP: ['COMPLETED'],
        OUT_FOR_DELIVERY: ['COMPLETED'],
      } as Record<string, string[]>
    )[status] || []
  );
}
