import { supabase } from './supabase';

// Simple in-memory cache for the session — room images are small and few
// enough per room that IndexedDB (like MediaCache for 1:1 chat) would be
// overkill; this just avoids re-fetching the same image on re-render.
const cache = new Map<string, string>(); // messageId -> object URL

export async function getRoomImageUrl(messageId: string): Promise<string> {
  const cached = cache.get(messageId);
  if (cached) return cached;

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('You\u2019ve been signed out. Please log in again.');

  const res = await fetch('/api/media/room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messageId }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error || ''; } catch { /* not JSON */ }
    throw new Error(detail || `Failed to load image (${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  cache.set(messageId, url);
  return url;
}
