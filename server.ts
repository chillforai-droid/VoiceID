import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "./src/lib/b2";
import { createClient } from "@supabase/supabase-js";

async function startServer() {
  const supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper: Verify Auth
  const verifyAuth = async (req: express.Request) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return null;
    return user;
  };

  // API routes
  app.delete("/api/media/delete/:objectKey", async (req, res) => {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    
    await getS3Client().send(new DeleteObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: req.params.objectKey,
    }));
    
    res.json({ success: true });
  });

  app.post("/api/media/upload", express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const objectKey = crypto.randomUUID();
    const command = new PutObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: objectKey,
      ContentType: req.headers['content-type'],
      Body: req.body,
    });
    
    await getS3Client().send(command);
    res.json({ objectKey });
  });

  app.post("/api/media/upload-auth", async (req, res) => {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { mimeType } = req.body;
    const objectKey = crypto.randomUUID();
    const command = new PutObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: objectKey,
      ContentType: mimeType,
    });
    
    const url = await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
    res.json({ url, objectKey });
  });

  app.post("/api/media/download-auth", async (req, res) => {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { messageId } = req.body;
    const { data: message } = await supabaseAdmin.from("messages").select("*, conversations!inner(*)").eq("id", messageId).single();
    
    if (!message || message.conversations.user_id !== user.id) {
        return res.status(403).json({ error: "Forbidden" });
    }

    const command = new GetObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: message.b2_object_key,
    });
    
    const url = await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
    res.json({ url });
  });

  app.post("/api/media/ack", async (req, res) => {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { messageId } = req.body;
    const { data: message } = await supabaseAdmin.from("messages").select("*").eq("id", messageId).single();
    
    if (!message || message.sender_id === user.id) {
        return res.status(403).json({ error: "Forbidden" });
    }

    await getS3Client().send(new DeleteObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: message.b2_object_key,
    }));

    await supabaseAdmin.from("messages").update({ media_status: "delivered" }).eq("id", messageId);
    
    res.json({ success: true });
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
