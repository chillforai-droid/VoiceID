import { VercelRequest, VercelResponse } from "@vercel/node";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../lib/b2.js";
import { verifyAuth, supabaseAdmin } from "../../lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
    
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    
    const objectKey = req.query.objectKey as string;
    if (!objectKey) return res.status(400).json({ error: "Missing objectKey" });

    // Previously this endpoint deleted any object key it was given as long
    // as the caller was authenticated — it never checked that the caller
    // actually owned the message that referenced this key. That let any
    // logged-in user delete any other user's media from B2. This mirrors
    // the caller's own sender-only delete flow: only the message's sender
    // may delete the underlying object (matching the RLS delete policy on
    // `messages` itself, which is also sender-only).
    const { data: message, error: lookupError } = await supabaseAdmin
        .from("messages")
        .select("id, sender_id")
        .eq("b2_object_key", objectKey)
        .maybeSingle();

    if (lookupError) {
        console.error("Delete: error looking up message for objectKey", lookupError);
        return res.status(500).json({ error: "Internal Server Error" });
    }

    // If no message references this key, there's nothing this endpoint
    // should be deleting on the caller's behalf — treat as not found rather
    // than silently succeeding or blindly deleting an orphaned key.
    if (!message) return res.status(404).json({ error: "Not found" });
    if (message.sender_id !== user.id) return res.status(403).json({ error: "Forbidden" });

    await getS3Client().send(new DeleteObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: objectKey,
    }));

    res.json({ success: true });
}
