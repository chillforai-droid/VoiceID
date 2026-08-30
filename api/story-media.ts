import { VercelRequest, VercelResponse } from "@vercel/node";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../lib/b2.js";
import { supabaseAdmin } from "../lib/auth.js";

/**
 * Story media is public by design (anyone visiting a profile can see an active
 * story), so unlike /api/media/download this endpoint intentionally requires no
 * auth — it only checks that the story exists and hasn't expired yet, then
 * streams the bytes from B2 through our own origin (same CORS-safety reasoning
 * as /api/download for chat media).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const storyId = (req.method === "GET" ? req.query.storyId : req.body?.storyId) as string | undefined;
    if (!storyId) return res.status(400).json({ error: "storyId is required" });

    const { data: story, error: storyError } = await supabaseAdmin
      .from("stories")
      .select("id, media_object_key, mime_type, expires_at")
      .eq("id", storyId)
      .maybeSingle();

    if (storyError || !story) return res.status(404).json({ error: "Story not found" });
    if (!story.media_object_key) return res.status(404).json({ error: "Story has no media" });
    if (new Date(story.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: "Story has expired" });
    }

    const object = await getS3Client().send(new GetObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: story.media_object_key,
    }));

    if (!object.Body) return res.status(404).json({ error: "Media object is empty" });

    const bytes = await object.Body.transformToByteArray();
    const contentType = story.mime_type || object.ContentType || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(bytes.byteLength));
    // Safe to cache publicly (unlike private chat media) — the story itself is
    // meant to be seen by anyone, and the short max-age keeps it roughly in
    // sync with the 24h expiry without re-fetching on every view.
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(Buffer.from(bytes));
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NoSuchKey") {
      return res.status(404).json({ error: "Media object not found" });
    }
    console.error("Story media fetch failed", error);
    return res.status(500).json({ error: "Story media fetch failed", message: error?.message });
  }
}
