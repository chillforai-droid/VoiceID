import { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../lib/b2.js";
import { verifyAuth } from "../lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    let stage = "initialization";
    try {
        stage = "authentication";
        const user = await verifyAuth(req);
        if (!user) return res.status(401).json({ error: "Unauthorized" });

        stage = "body_validation";
        // ROOT CAUSE FIX (2026-08-04): neither this endpoint nor any client validated that
        // req.body actually contained bytes before writing it to B2. Depending on runtime
        // (Vercel's implicit content-type-based body parsing vs. Express's explicit
        // express.raw() in server.ts) an empty/missing Content-Type — which browsers can send
        // for some picked files, e.g. HEIC or extension-less images — could result in an
        // empty or undefined req.body. PutObjectCommand does not itself reject an empty body,
        // so this silently created a 0-byte object in B2. The sender saw "success" (a valid
        // objectKey came back), the messages row was created normally, and the failure only
        // surfaced much later, per-recipient, as a corrupt/undecodable file with no visible
        // error (see ImageMessageContent/VoiceMessageContent on Android). Failing loudly here
        // means the sender's own upload attempt errors immediately and visibly instead.
        const body = req.body;
        const bodyLength = Buffer.isBuffer(body) ? body.length : (typeof body === "string" ? body.length : 0);
        if (!body || bodyLength === 0) {
            stage = "body_validation";
            console.error("Upload rejected: empty request body", {
                contentType: req.headers["content-type"] || "(missing)",
                contentLength: req.headers["content-length"] || "(missing)",
            });
            return res.status(400).json({
                error: "Upload failed",
                stage,
                message: "No file data was received. This can happen if the browser sent no Content-Type for the selected file — please try again.",
            });
        }

        stage = "s3_client_setup";
        const s3Client = getS3Client();

        const objectKey = crypto.randomUUID();
        const command = new PutObjectCommand({
          Bucket: process.env.B2_BUCKET_NAME,
          Key: objectKey,
          // Fallback keeps the object retrievable/servable with a sane type even on the
          // (now-rejected-above for empty body, but still possible for a non-empty body)
          // edge case where the browser sent no Content-Type at all.
          ContentType: (req.headers['content-type'] as string) || "application/octet-stream",
          Body: req.body,
        });
        
        stage = "s3_upload";
        await s3Client.send(command);
        
        stage = "success";
        res.json({ objectKey });
    } catch (e: any) {
        console.error(`Upload failed at stage: ${stage}`, e);
        res.status(500).json({ 
            error: "Upload failed",
            stage,
            message: e.message,
            details: e.$metadata || {} 
        });
    }
}
