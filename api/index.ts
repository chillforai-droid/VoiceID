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
 * Vercel Hobby limits a project to 12 Serverless Functions per deployment.
 * Keeping every endpoint under api/ would hit that limit. The actual handlers
 * live in lib/api-handlers/ (which Vercel does not count as functions), while
 * this file is the only file under api/ and dispatches requests by `route`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = String(req.query.route || "").toLowerCase();

  switch (route) {
    case "upload":
      return uploadHandler(req, res);
    case "upload-auth":
      return uploadAuthHandler(req, res);
    case "download-auth":
      return downloadAuthHandler(req, res);
    case "download":
      return downloadHandler(req, res);
    case "ack":
      return ackHandler(req, res);
    case "delete":
      (req as any).query = { ...req.query, objectKey: req.query.objectKey };
      return deleteHandler(req, res);
    case "story-media":
      return storyMediaHandler(req, res);
    case "profile-og":
      return profileOgHandler(req, res);
    case "ai-reply":
      return aiReplyHandler(req, res);
    case "send-push":
      return sendPushHandler(req, res);
    case "delete-account":
      return deleteAccountHandler(req, res);
    case "cloudinary-sign":
      return cloudinarySignHandler(req as any, res as any);
    default:
      return res.status(404).json({ error: "API route not found" });
  }
}
