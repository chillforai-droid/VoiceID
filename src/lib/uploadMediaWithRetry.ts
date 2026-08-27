import { supabase } from './supabase';

/**
 * Vercel serverless functions cap request bodies at ~4.5MB. /api/media/upload
 * proxies the raw file bytes through our own function, so anything over that
 * (a video story, a long voice note, a large camera photo) fails outright —
 * this is the actual cause behind the intermittent "Failed to fetch" on
 * story/image/voice uploads. Checking this client-side turns an unpredictable
 * mid-upload failure into an immediate, clear message.
 *
 * (There's also an unused presigned-URL direct-to-storage path already wired
 * up server-side at /api/media/upload-auth, which would remove this limit
 * entirely — but switching to it requires CORS to be enabled on the B2
 * bucket for this domain first, which hasn't been confirmed, so this fix
 * stays on the existing proxy route and focuses on making its failures
 * predictable and recoverable instead.)
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB, with headroom under the 4.5MB cap

export class UploadTooLargeError extends Error {
  constructor(sizeBytes: number) {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
    super(`This file is ${mb}MB, which is too large to upload (max 4MB). Please choose a smaller file.`);
    this.name = 'UploadTooLargeError';
  }
}

function isNetworkError(err: any): boolean {
  // fetch() throws a bare TypeError for network-level failures (offline,
  // DNS failure, connection dropped, CORS) — this is exactly what surfaces
  // to users as the unhelpful "Failed to fetch".
  return err instanceof TypeError || /failed to fetch/i.test(err?.message || '');
}

/**
 * Uploads a file/blob via the existing /api/media/upload proxy, with:
 *  - an upfront size check (clear error instead of a mid-upload failure)
 *  - automatic retry with backoff for transient network drops (common on
 *    mobile switching networks / weak signal mid-upload)
 *  - error messages that describe what actually happened, instead of the
 *    raw "Failed to fetch"
 */
export async function uploadMediaWithRetry(file: Blob, mimeType: string, maxAttempts = 3): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadTooLargeError(file.size);
  }

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) {
    throw new Error('You\u2019ve been signed out. Please log in again and retry.');
  }

  let lastError: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': mimeType, Authorization: `Bearer ${token}` },
        body: file,
      });

      if (!res.ok) {
        let message = `Upload failed (${res.status}).`;
        try {
          const body = await res.json();
          if (body?.message) message = body.message;
        } catch { /* response wasn't JSON — keep the generic message */ }
        // 4xx (auth, bad request, payload too large) won't succeed on retry.
        if (res.status >= 400 && res.status < 500) throw new Error(message);
        throw Object.assign(new Error(message), { retryable: true });
      }

      const { objectKey } = await res.json();
      if (!objectKey) throw new Error('Upload succeeded but no file reference was returned.');
      return objectKey;
    } catch (err: any) {
      lastError = err;
      const canRetry = attempt < maxAttempts - 1 && (isNetworkError(err) || err?.retryable);
      if (!canRetry) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }

  if (isNetworkError(lastError)) {
    throw new Error('Network error — check your connection and try again.');
  }
  throw lastError instanceof Error ? lastError : new Error('Upload failed. Please try again.');
}
