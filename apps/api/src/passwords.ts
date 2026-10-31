import bcrypt from 'bcrypt';
const COST = 12;
export function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Password must contain at least 12 characters and at most 72 UTF-8 bytes.');
  }
  return bcrypt.hash(password, COST);
}
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (Buffer.byteLength(password, 'utf8') > 72 || !/^\$2[ab]\$/.test(hash))
    return Promise.resolve(false);
  return bcrypt.compare(password, hash);
}
