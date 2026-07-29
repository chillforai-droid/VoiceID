import { supabase } from './supabase';
import { MediaCache } from './MediaCache';

/**
 * Shared B2 download flow used by both ImageMessage and VoiceMessage.
 *
 * 1. Returns the locally cached blob if we already have it.
 * 2. Otherwise requests a signed download URL from /api/media/download-auth,
 *    downloads the object, caches it in MediaCache, and acknowledges receipt
 *    via /api/media/ack (which lets the server delete the ephemeral B2
 *    object). Acking is best-effort: it is expected to fail (403) when the
 *    viewer is the message sender, since only the recipient should trigger
 *    server-side cleanup.
 */
export async function fetchAndCacheMedia(message: any, mediaType: 'image' | 'voice'): Promise<Blob> {
  const cached = await MediaCache.getMedia(message.id);
  if (cached) return cached.blob;

  if (!message.b2_object_key) {
    throw new Error('Message has no B2 object key');
  }

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const res = await fetch('/api/media/download-auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messageId: message.id }),
  });

  if (!res.ok) {
    throw new Error(`Download authorization failed (${res.status})`);
  }

  const { url: downloadUrl } = await res.json();
  if (!downloadUrl) {
    throw new Error('Invalid download URL');
  }

  const blobRes = await fetch(downloadUrl);
  if (!blobRes.ok) {
    throw new Error(`Failed to fetch media (${blobRes.status})`);
  }
  const blob = await blobRes.blob();

  await MediaCache.putMedia({
    messageId: message.id,
    mediaType,
    blob,
    mimeType: message.mime_type || blob.type,
    byteSize: message.byte_size || blob.size,
    createdAt: Date.now(),
    sha256: message.sha256 || '',
    deliveryStatus: 'delivered',
  });

  // Best-effort ack; server rejects this for the sender's own message, which is fine.
  fetch('/api/media/ack', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messageId: message.id }),
  }).catch(() => {});

  return blob;
}
