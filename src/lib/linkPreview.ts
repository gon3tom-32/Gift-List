// Asks our small server function for a pasted link's title and picture.
// Any failure just returns null: saving a gift never waits on this.

import { supabase } from './supabase';

export interface LinkPreview {
  title: string | null;
  image: string | null;
  site: string | null;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+\.\S+/i.test(text.trim());
}

/** Store name from a link, e.g. "target.com" → "Target". */
export function storeFromUrl(link: string): string | null {
  try {
    const host = new URL(link).hostname.replace(/^(www|m|smile|shop)\./, '');
    const base = host.split('.').slice(-2, -1)[0] ?? host;
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : null;
  } catch {
    return null;
  }
}

export async function fetchLinkPreview(link: string, timeoutMs = 6000): Promise<LinkPreview | null> {
  if (!looksLikeUrl(link)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(link.trim())}`, {
      headers: await authHeader(),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as LinkPreview;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Downloads a preview picture through our server (other sites block direct downloads). */
export async function fetchPreviewImage(imageUrl: string): Promise<Blob | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`/api/link-preview?image=${encodeURIComponent(imageUrl)}`, {
      headers: await authHeader(),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith('image/') ? blob : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
