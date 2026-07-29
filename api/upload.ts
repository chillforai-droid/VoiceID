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

        stage = "s3_client_setup";
        const s3Client = getS3Client();

        const objectKey = crypto.randomUUID();
        const command = new PutObjectCommand({
          Bucket: process.env.B2_BUCKET_NAME,
          Key: objectKey,
          ContentType: req.headers['content-type'],
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
