import { VercelRequest, VercelResponse } from "@vercel/node";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../lib/b2.js";
import { verifyAuth, supabaseAdmin } from "../lib/auth.js";

/**
 * Room image media. Unlike /api/download (1:1 chat), this is NOT
 * ephemeral — a room can have many active members and there's no single
 * "the recipient has now seen it" moment to delete the object on, so the
 * image just persists in B2 for as long as the message exists. Unlike
 * /api/story-media, it's not public either — only active members of the
 * room that owns the message may fetch it.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const messageId = (req.method === "GET" ? req.query.messageId : req.body?.messageId) as string | undefined;
    if (!messageId) return res.status(400).json({ error: "messageId is required" });

    const { data: message, error: messageError } = await supabaseAdmin
      .from("room_messages")
      .select("id, room_id, b2_object_key, mime_type")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError || !message) return res.status(404).json({ error: "Message not found" });
    if (!message.b2_object_key) return res.status(404).json({ error: "Message has no media" });

    const { data: membership } = await supabaseAdmin
      .from("room_members")
      .select("id")
      .eq("room_id", message.room_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) return res.status(403).json({ error: "Not a member of this room" });

    const object = await getS3Client().send(new GetObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: message.b2_object_key,
    }));

    if (!object.Body) return res.status(404).json({ error: "Media object is empty" });

    const bytes = await object.Body.transformToByteArray();
    const contentType = message.mime_type || object.ContentType || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(bytes.byteLength));
    // Private: gated on room membership, so don't let a shared/CDN cache serve it cross-user.
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).send(Buffer.from(bytes));
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NoSuchKey") {
      return res.status(404).json({ error: "Media object not found" });
    }
    console.error("Room media fetch failed", error);
    return res.status(500).json({ error: "Room media fetch failed", message: error?.message });
  }
}
