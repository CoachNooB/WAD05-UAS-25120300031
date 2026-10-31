import session from 'express-session';
import { db, transaction } from './database.js';
export class DatabaseSessionStore extends session.Store {
  get(sid: string, cb: (err: any, data?: any) => void) {
    db.session
      .findUnique({ where: { sid } })
      .then((row: any) => cb(null, row && row.expiresAt > new Date() ? JSON.parse(row.data) : null))
      .catch(cb);
  }
  set(sid: string, data: any, cb: (err?: any) => void = () => {}) {
    const expiresAt = new Date(Math.min(Date.now() + 7200000, data.absoluteExpiresAt || Infinity));
    transaction((tx) =>
      tx.session.upsert({
        where: { sid },
        create: { sid, data: JSON.stringify(data), expiresAt },
        update: { data: JSON.stringify(data), expiresAt },
      }),
    )
      .then(() => cb())
      .catch(cb);
  }
  destroy(sid: string, cb: (err?: any) => void = () => {}) {
    transaction((tx) => tx.session.deleteMany({ where: { sid } }))
      .then(() => cb())
      .catch(cb);
  }
  touch(sid: string, data: any, cb: (err?: any) => void = () => {}) {
    this.set(sid, data, cb);
  }
}
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    csrfToken?: string;
    authenticatedAt?: number;
    absoluteExpiresAt?: number;
  }
}
