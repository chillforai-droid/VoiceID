import { Request, Response } from 'express';
import crypto from 'crypto';

export default function handler(req: Request, res: Response) {
  const { timestamp, folder } = req.body;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  
  if (!apiSecret || !apiKey) {
    return res.status(500).json({ error: 'Cloudinary configuration missing' });
  }

  const params = {
    timestamp,
    folder,
  };

  const signature = crypto
    .createHash('sha1')
    .update(Object.keys(params).sort().map(key => `${key}=${params[key as keyof typeof params]}`).join('&') + apiSecret)
    .digest('hex');

  res.json({ signature, apiKey });
}
