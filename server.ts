import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import uploadHandler from "./api/upload";
import uploadAuthHandler from "./api/upload-auth";
import downloadAuthHandler from "./api/download-auth";
import ackHandler from "./api/ack";
import deleteHandler from "./api/delete/[objectKey]";
import cloudinarySignHandler from "./api/cloudinary-sign";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mirror the security headers set in vercel.json's `headers` block so the
  // Express (dev/Docker) deployment path isn't missing them.
  app.use((req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com https:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  app.post("/api/media/upload", express.raw({ type: '*/*', limit: '10mb' }), (req, res) => uploadHandler(req as any, res as any));
  app.post("/api/media/upload-auth", (req, res) => uploadAuthHandler(req as any, res as any));
  app.post("/api/media/download-auth", (req, res) => downloadAuthHandler(req as any, res as any));
  app.post("/api/media/ack", (req, res) => ackHandler(req as any, res as any));
  app.delete("/api/media/delete/:objectKey", (req, res) => {
    (req as any).query = { ...req.query, objectKey: req.params.objectKey };
    deleteHandler(req as any, res as any);
  });
  app.post("/api/cloudinary-sign", (req, res) => cloudinarySignHandler(req as any, res as any));

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
