import { VercelRequest, VercelResponse } from "@vercel/node";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../../src/lib/b2";
import { verifyAuth } from "../../src/lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
    
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    
    const objectKey = req.query.objectKey as string;
    
    await getS3Client().send(new DeleteObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: objectKey,
    }));
    
    res.json({ success: true });
}
