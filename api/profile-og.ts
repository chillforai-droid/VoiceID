import { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../lib/auth.js";

const SITE = "https://voiceid.online";
const DEFAULT_IMAGE = `${SITE}/og-image.png`;
const DEFAULT_TITLE = "VoiceID — Connect, Message & Talk Without Sharing Your Phone Number";
const DEFAULT_DESCRIPTION = "VoiceID allows you to connect with friends using your username, not your phone number. Message, send voice notes, and make voice calls securely.";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// If the avatar is hosted on Cloudinary, ask Cloudinary to crop it to a
// social-preview-friendly square so link previews look consistent
// regardless of the source photo's aspect ratio.
function socialImage(avatarUrl: string | null | undefined): string {
  if (!avatarUrl) return DEFAULT_IMAGE;
  if (avatarUrl.includes("res.cloudinary.com") && avatarUrl.includes("/upload/")) {
    return avatarUrl.replace("/upload/", "/upload/w_800,h_800,c_fill,g_face,q_auto,f_auto/");
  }
  return avatarUrl;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const usernameParam = req.query.username;
  const username = String(Array.isArray(usernameParam) ? usernameParam[0] : usernameParam || "").toLowerCase();

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;
  let image = DEFAULT_IMAGE;
  let isDefaultImage = true;
  const url = username ? `${SITE}/u/${encodeURIComponent(username)}` : SITE;

  if (username) {
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("username, display_name, bio, avatar_url")
        .eq("username", username)
        .maybeSingle();

      if (profile) {
        const name = profile.display_name || profile.username;
        title = `${name} (@${profile.username}) | VoiceID`;
        description = profile.bio
          ? String(profile.bio).slice(0, 160)
          : `Connect with @${profile.username} on VoiceID — message, send voice notes, and call without sharing phone numbers.`;
        image = socialImage(profile.avatar_url);
        isDefaultImage = image === DEFAULT_IMAGE;
      }
    } catch (error) {
      console.error("[profile-og] profile lookup failed", error);
      // fall through to defaults — a broken preview is better than a broken share link
    }
  }

  let html: string;
  try {
    const forwardedProto = req.headers["x-forwarded-proto"];
    const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)
      || (String(req.headers.host || "").includes("localhost") ? "http" : "https");
    const origin = `${proto}://${req.headers.host}`;
    const baseRes = await fetch(`${origin}/index.html`);
    html = await baseRes.text();
  } catch (error) {
    console.error("[profile-og] failed to load base index.html", error);
    res.status(302).setHeader("Location", url).end();
    return;
  }

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${esc(description)}" />`);
  html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(url)}" />`);
  html = html.replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(description)}" />`);
  html = html.replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${esc(url)}" />`);
  html = html.replace(/<meta property="og:type"[^>]*>/i, `<meta property="og:type" content="profile" />`);
  html = html.replace(/<meta property="og:image"[^>]*>/i, `<meta property="og:image" content="${esc(image)}" />`);
  html = html.replace(/<meta property="og:image:alt"[^>]*>/i, `<meta property="og:image:alt" content="${esc(title)}" />`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${esc(title)}" />`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${esc(description)}" />`);
  html = html.replace(/<meta name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${esc(image)}" />`);
  // A user avatar's real dimensions won't match the site default's 1200x630 — drop the
  // fixed size hints so crawlers measure the actual image instead of a mismatched box.
  if (!isDefaultImage) {
    html = html.replace(/<meta property="og:image:width"[^>]*>\s*/i, "");
    html = html.replace(/<meta property="og:image:height"[^>]*>\s*/i, "");
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(html);
}
