import { db, transaction } from './database.js';
import { removeImage } from './storage.js';
const expired = await transaction(async (tx) => ({
  sessions: await tx.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  rateLimits: await tx.authRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
}));
// Re-attempt unreferenced storage deletion; removeImage retains a cleanup reference on failure.
for (const item of await db.storageCleanup.findMany({ take: 100 })) {
  await removeImage(item.path);
  await transaction((tx) => tx.storageCleanup.delete({ where: { id: item.id } }));
}
console.log('Maintenance complete.', expired);
await db.$disconnect();
