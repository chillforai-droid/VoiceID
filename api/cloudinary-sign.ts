import { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from 'crypto';
import { verifyAuth } from "../lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Previously this endpoint had no auth check at all, and trusted the
  // client-supplied `public_id` unconditionally. Since avatar uploads use
  // `public_id: user.id`, that combination let an unauthenticated caller
  // sign an upload for *any* user's id and overwrite their avatar. Both
  // gaps are closed here: require a valid session, and force public_id to
  // the authenticated user's own id regardless of what the client sent.
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { timestamp, folder } = req.body;
  const public_id = user.id;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  
  if (!apiSecret || !apiKey) {
    console.error("Cloudinary configuration missing");
    return res.status(500).json({ error: 'Cloudinary configuration missing' });
  }

  const params: Record<string, any> = {
    timestamp,
    folder,
    public_id,
  };
  
  if (!timestamp || !folder) {
    console.error("Missing required parameters", params);
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const signature = crypto
    .createHash('sha1')
    .update(Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&') + apiSecret)
    .digest('hex');

  res.json({ signature, apiKey });
}
