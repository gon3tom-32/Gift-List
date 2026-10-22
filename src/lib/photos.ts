// Photos: shrink on the phone before upload, store in the private bucket under
// '<household_id>/<kind>/<id>-<time>.<ext>', and show them with signed URLs.

import { useEffect, useState } from 'react';
import { PHOTO_BUCKET, supabase } from './supabase';

const MAX_WIDTH = 1200;
const QUALITY = 0.82;

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // fall through to <img>, e.g. older Safari
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/** Resizes to at most 1200px wide and re-encodes as WebP (or JPEG if WebP isn't supported). */
export async function resizeImage(file: Blob): Promise<{ blob: Blob; ext: 'webp' | 'jpg' }> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not a picture.');
  const img = await loadBitmap(file);
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const scale = Math.min(1, MAX_WIDTH / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the picture.');
  ctx.fillStyle = '#fff'; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if ('close' in img) img.close();

  const webp = await canvasToBlob(canvas, 'image/webp');
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' };
  const jpeg = await canvasToBlob(canvas, 'image/jpeg');
  if (!jpeg) throw new Error('Could not process the picture.');
  return { blob: jpeg, ext: 'jpg' };
}

/** Resizes and uploads a photo. Returns the storage path to save on the row. */
export async function uploadPhoto(
  householdId: string,
  kind: 'gifts' | 'people' | 'household',
  id: string,
  file: Blob,
): Promise<string> {
  const { blob, ext } = await resizeImage(file);
  // A new name each time, so a cached signed URL never shows the old picture.
  const path = `${householdId}/${kind}/${id}-${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function deletePhoto(path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

// Signed URLs last an hour; reuse them for 50 minutes.
const TTL_SECONDS = 3600;
const cache = new Map<string, { url: string; expires: number }>();
const pending = new Map<string, Promise<string | null>>();

export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  let p = pending.get(path);
  if (!p) {
    p = supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, TTL_SECONDS)
      .then(({ data, error }) => {
        pending.delete(path);
        if (error || !data) return null;
        cache.set(path, { url: data.signedUrl, expires: Date.now() + (TTL_SECONDS - 600) * 1000 });
        return data.signedUrl;
      });
    pending.set(path, p);
  }
  return p;
}

export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? (cache.get(path)?.url ?? null) : null));
  useEffect(() => {
    let live = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedUrl(path).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path]);
  return url;
}
