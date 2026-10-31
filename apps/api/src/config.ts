import 'dotenv/config';
export const production = process.env.NODE_ENV === 'production';
export const localDemo = !process.env.DATABASE_URL;
// Hosted demos keep cloud persistence while displaying fictional payment details.
export const demo = localDemo || process.env.DEMO_MODE === 'true';
if (
  production &&
  (localDemo ||
    !process.env.SESSION_SECRET ||
    !process.env.APP_ORIGIN ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_STORAGE_SECRET_KEY ||
    !process.env.SUPABASE_STORAGE_BUCKET ||
    (!demo &&
      (!process.env.STORE_ADDRESS ||
        !process.env.DELIVERY_SERVICE_AREA ||
        !process.env.BANK_NAME ||
        !process.env.BANK_ACCOUNT_NUMBER ||
        !process.env.BANK_ACCOUNT_HOLDER)) ||
    process.env.SESSION_SECRET.length < 32)
)
  throw new Error(
    'Production requires database, session, origin and private-storage configuration.',
  );
export const origins = (
  process.env.ALLOWED_ORIGINS ||
  process.env.APP_ORIGIN ||
  'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
export const cookieName = production ? '__Host-beverage_session' : 'sistabrew_session';
export const cookie = {
  httpOnly: true,
  secure: production,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 2 * 60 * 60 * 1000,
};
const fee = Number(process.env.DELIVERY_FEE_IDR || 15000);
if (!Number.isInteger(fee) || fee < 0 || fee > 10000000) throw new Error('Invalid delivery fee');
export const store = {
  name: 'SistaBrew',
  address: process.env.STORE_ADDRESS || 'Demo studio · Bandung, Indonesia',
  serviceArea: process.env.DELIVERY_SERVICE_AREA || 'Bandung city, within 5 km of the store (demo)',
  deliveryFee: fee,
  currency: 'IDR',
  demo,
  bank: {
    name: demo ? 'Demo bank — no real transfer' : process.env.BANK_NAME!,
    accountNumber: demo ? 'DEMO-ONLY' : process.env.BANK_ACCOUNT_NUMBER!,
    accountHolder: demo ? 'SistaBrew Demo' : process.env.BANK_ACCOUNT_HOLDER!,
  },
};
