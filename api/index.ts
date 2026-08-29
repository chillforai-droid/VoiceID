import type { VercelRequest, VercelResponse } from "@vercel/node";

import uploadHandler from "../lib/api-handlers/upload";
import uploadAuthHandler from "../lib/api-handlers/upload-auth";
import downloadAuthHandler from "../lib/api-handlers/download-auth";
import downloadHandler from "../lib/api-handlers/download";
import ackHandler from "../lib/api-handlers/ack";
import deleteHandler from "../lib/api-handlers/delete-object";
import profileOgHandler from "../lib/api-handlers/profile-og";
import storyMediaHandler from "../lib/api-handlers/story-media";
import aiReplyHandler from "../lib/api-handlers/ai-reply";
import sendPushHandler from "../lib/api-handlers/send-push";
import deleteAccountHandler from "../lib/api-handlers/delete-account";
import cloudinarySignHandler from "../lib/api-handlers/cloudinary-sign";

/**
 * Single Vercel Serverless Function dispatcher.
 *
 * Vercel Hobby deployments have a per-deployment Serverless Function limit.
 * Only this file lives under /api so all application API handlers are bundled
 * behind one Vercel Function. The public URLs stay unchanged through
 * vercel.json rewrites.
 *
 * The pathname fallback is intentional: if a request reaches this function
 * without the expected `route` query parameter (for example from a local
 * test or a future routing change), we can still resolve the known endpoint
 * instead of returning a misleading 404.
 */

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const HANDLERS: Record<string, Handler> = {
  upload: uploadHandler,
  "upload-auth": uploadAuthHandler,
  "download-auth": downloadAuthHandler,
  download: downloadHandler,
  ack: ackHandler,
  delete: deleteHandler,
  "story-media": storyMediaHandler,
  "profile-og": profileOgHandler,
  "ai-reply": aiReplyHandler,
  "send-push": sendPushHandler,
  "delete-account": deleteAccountHandler,
  "cloudinary-sign": cloudinarySignHandler as Handler,
};

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function resolveRoute(req: VercelRequest): string {
  const explicit = firstQueryValue(req.query.route).toLowerCase();
  if (explicit) return explicit;

  // Defensive fallback for direct /api/<endpoint> requests.
  const pathname = String(req.url || "").split("?", 1)[0];
  const pathMap: Record<string, string> = {
    "/api/media/upload": "upload",
    "/api/media/upload-auth": "upload-auth",
    "/api/media/download-auth": "download-auth",
    "/api/media/download": "download",
    "/api/media/ack": "ack",
    "/api/media/story": "story-media",
    "/api/ai-reply": "ai-reply",
    "/api/send-push": "send-push",
    "/api/delete-account": "delete-account",
    "/api/cloudinary-sign": "cloudinary-sign",
  };

  if (pathMap[pathname]) return pathMap[pathname];
  if (pathname.startsWith("/api/media/delete/")) return "delete";
  return "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = resolveRoute(req);
  const selected = HANDLERS[route];

  if (!selected) {
    return res.status(404).json({ error: "API route not found" });
  }

  // Preserve the objectKey from the rewrite/path for the delete handler.
  if (route === "delete" && !req.query.objectKey) {
    const pathname = String(req.url || "").split("?", 1)[0];
    const marker = "/api/media/delete/";
    if (pathname.startsWith(marker)) {
      (req as any).query = {
        ...req.query,
        objectKey: decodeURIComponent(pathname.slice(marker.length)),
      };
    }
  }

  return selected(req, res);
}
