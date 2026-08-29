import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import uploadHandler from "./lib/api-handlers/upload";
import uploadAuthHandler from "./lib/api-handlers/upload-auth";
import downloadAuthHandler from "./lib/api-handlers/download-auth";
import downloadHandler from "./lib/api-handlers/download";
import ackHandler from "./lib/api-handlers/ack";
import deleteHandler from "./lib/api-handlers/delete-object";
import profileOgHandler from "./lib/api-handlers/profile-og";
import storyMediaHandler from "./lib/api-handlers/story-media";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/media/upload", express.raw({ type: '*/*', limit: '10mb' }), (req, res) => uploadHandler(req as any, res as any));
  app.post("/api/media/upload-auth", (req, res) => uploadAuthHandler(req as any, res as any));
  app.post("/api/media/download-auth", (req, res) => downloadAuthHandler(req as any, res as any));
  app.post("/api/media/download", (req, res) => downloadHandler(req as any, res as any));
  app.post("/api/media/ack", (req, res) => ackHandler(req as any, res as any));
  app.delete("/api/media/delete/:objectKey", (req, res) => {
    (req as any).query = { ...req.query, objectKey: req.params.objectKey };
    deleteHandler(req as any, res as any);
  });
  app.get("/api/media/story", (req, res) => storyMediaHandler(req as any, res as any));
  // Server-render per-user OG meta tags (avatar image, name, bio) so social apps
  // show the shared profile's own photo instead of the generic site preview.
  app.get("/u/:username", (req, res) => {
    (req as any).query = { ...req.query, username: req.params.username };
    profileOgHandler(req as any, res as any);
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
