import { prisma } from '@sistabrew/db';
import { localDemo } from './config.js';
import { demoDatabase } from './demo-db.js';
export const db: any = localDemo ? await demoDatabase(process.env.DEMO_DATA_FILE) : prisma;
export async function transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn);
    } catch (e: any) {
      if (e.code === 'P2034' && attempt < 2) {
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
        continue;
      }
      throw e;
    }
  }
}
