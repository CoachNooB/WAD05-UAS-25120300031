import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { localDemo } from './config.js';
import { Fault, digest } from './services.js';
import { db, transaction } from './database.js';
const root = resolve(process.env.DEMO_UPLOAD_DIR || '.data/uploads');
const client = process.env.SUPABASE_URL
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_STORAGE_SECRET_KEY!, {
      auth: { persistSession: false },
    })
  : null;
const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
export async function validatedImage(buffer: Buffer) {
  const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (!jpeg && !png && !webp)
    throw new Fault(415, 'INVALID_IMAGE', 'Upload a JPEG, PNG, or WebP image.');
  try {
    return await sharp(buffer, { limitInputPixels: 16000000 })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new Fault(415, 'INVALID_IMAGE', 'The image could not be decoded or is too large.');
  }
}
export async function uploadImage(prefix: string, buffer: Buffer) {
  const data = await validatedImage(buffer);
  const path = `${prefix}/${randomUUID()}.webp`;
  if (localDemo) {
    await mkdir(resolve(root, prefix), { recursive: true });
    await writeFile(resolve(root, path), data);
  } else {
    const { error } = await client!.storage
      .from(bucket)
      .upload(path, data, { contentType: 'image/webp', upsert: false });
    if (error)
      throw new Fault(503, 'STORAGE_UNAVAILABLE', 'Image storage is temporarily unavailable.');
  }
  return { path, hash: digest(data) };
}
export async function removeImage(path: string) {
  try {
    if (localDemo) await unlink(resolve(root, path));
    else {
      const { error } = await client!.storage.from(bucket).remove([path]);
      if (error) throw error;
    }
  } catch {
    await transaction((tx) => tx.storageCleanup.create({ data: { path } }));
  }
}
export async function imageUrl(path: string, seconds = 900) {
  if (localDemo) return { url: null, expiresAt: null };
  const { data, error } = await client!.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) throw new Fault(503, 'STORAGE_UNAVAILABLE', 'Image is temporarily unavailable.');
  return { url: data.signedUrl, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
}
export async function localImage(path: string) {
  return readFile(resolve(root, path));
}
