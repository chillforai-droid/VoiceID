import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/cloudinary-sign", (req, res) => {
    console.log("Cloudinary sign request body:", req.body);
    const { timestamp, folder, public_id } = req.body;
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

    if (!timestamp || !folder || !public_id) {
      console.error("Missing required parameters", params);
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const signature = crypto
      .createHash('sha1')
      .update(Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&') + apiSecret)
      .digest('hex');

    res.json({ signature, apiKey });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
