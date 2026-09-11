/**
 * Owners can paste either a plain video URL or a full <iframe> embed
 * snippet (e.g. from YouTube's "Share > Embed"). We never store or render
 * the pasted HTML itself — only the src URL gets pulled out and validated,
 * and the room player always builds its own <iframe> around it. This
 * keeps a hostile/careless paste from injecting arbitrary iframe
 * attributes (onload handlers, sandbox overrides, etc.) into other
 * members' pages.
 */
export function extractVideoEmbedUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  const iframeMatch = trimmed.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (iframeMatch) candidate = iframeMatch[1];

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
