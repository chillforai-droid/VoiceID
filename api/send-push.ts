import { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../lib/auth.js";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp, getApps, cert } from "firebase-admin/app";

/**
 * Wakes the Android app for an incoming call or new message when it's
 * backgrounded or fully killed — something Supabase Realtime structurally
 * cannot do on its own, since a websocket subscription only stays alive
 * while the app process does.
 *
 * This is a merge of what used to be two separate files (send-call-push.ts
 * and send-message-push.ts) into one, purely to stay under Vercel Hobby's
 * 12-serverless-function-per-deployment cap — the logic is unchanged, it
 * just now branches on payload.table instead of being two files.
 *
 * Wiring (update/add these webhooks in the Supabase Dashboard, all pointing
 * to this same URL):
 *   Database -> Webhooks -> table "calls", event "Insert" ->
 *     URL = https://<your-domain>/api/send-push
 *   Database -> Webhooks -> table "messages", event "Insert" ->
 *     URL = https://<your-domain>/api/send-push
 *   Database -> Webhooks -> table "contacts", event "Insert" ->
 *     URL = https://<your-domain>/api/send-push
 *   All three need header `x-webhook-secret: <SUPABASE_WEBHOOK_SECRET>`
 *   (must match the env var below).
 *
 * Silently does nothing for any recipient without a push_tokens row yet
 * (web-only users, or Android users who haven't opened the app since this
 * shipped) — the existing Realtime/in-app path keeps working exactly as
 * before regardless. A user can have both an Android AND a web token
 * simultaneously (push_tokens is now keyed on (user_id, platform), not
 * just user_id) — sendToUserTokens() below sends to every registered
 * device, not just one.
 */

function ensureFirebaseInitialized() {
  if (getApps().length === 0) {
    // FIREBASE_SERVICE_ACCOUNT_KEY = the full service-account JSON (Firebase
    // Console -> Project settings -> Service accounts -> Generate new
    // private key), stored as a single-line env var in Vercel.
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
    initializeApp({ credential: cert(serviceAccount) });
  }
}

async function sendToUserTokens(userId: string, payload: Record<string, string>): Promise<{ sent: number; failed: number }> {
  const { data: tokenRows } = await supabaseAdmin
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId);

  if (!tokenRows || tokenRows.length === 0) return { sent: 0, failed: 0 };

  ensureFirebaseInitialized();

  const results = await Promise.allSettled(
    tokenRows.map((row) =>
      getMessaging().send({
        token: row.token,
        // Data-only (no `notification` block) on every platform: Android's
        // native FCM service and the website's firebase-messaging-sw.js
        // (see public/firebase-messaging-sw.js) both read these fields
        // themselves and call their own "show a notification" API, rather
        // than letting the OS auto-render a generic one with no deep link.
        data: payload,
        android: { priority: "high" },
        webpush: { headers: { Urgency: "high" } },
      })
    )
  );

  return {
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
}

async function handleCallPush(call: any, res: VercelResponse) {
  if (!call || call.status !== "ringing") {
    return res.json({ skipped: true, reason: "not a new ringing call" });
  }

  const { data: caller } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username")
    .eq("id", call.caller_id)
    .maybeSingle();

  try {
    const { sent, failed } = await sendToUserTokens(call.receiver_id, {
      type: "incoming_call",
      callId: call.id,
      callerId: call.caller_id,
      callerName: caller?.display_name || caller?.username || "Unknown",
      title: `Incoming call from ${caller?.display_name || caller?.username || "Unknown"}`,
      body: "Tap to answer",
      deep_link: `/dashboard`,
    });
    if (sent === 0 && failed === 0) return res.json({ skipped: true, reason: "receiver has no registered device token" });
    res.json({ success: true, sent, failed });
  } catch (error: any) {
    console.error("send-push (call): FCM send failed", error);
    res.status(500).json({ error: "Failed to send push" });
  }
}

async function handleMessagePush(message: any, res: VercelResponse) {
  if (!message?.conversation_id || !message?.sender_id) {
    return res.json({ skipped: true, reason: "not a valid new message" });
  }

  const { data: members } = await supabaseAdmin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", message.conversation_id)
    .neq("user_id", message.sender_id);

  if (!members || members.length === 0) {
    return res.json({ skipped: true, reason: "no other conversation members" });
  }

  const { data: sender } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username")
    .eq("id", message.sender_id)
    .maybeSingle();

  const senderName = sender?.display_name || sender?.username || "Someone";
  const preview =
    message.content_type === "voice" ? "\ud83c\udfa4 Voice message" :
    message.content_type === "image" ? "\ud83d\udcf7 Photo" :
    (message.content_body || "New message");

  const perUser = await Promise.all(
    members.map((m) =>
      sendToUserTokens(m.user_id, {
        type: "new_message",
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        senderName,
        title: senderName,
        body: preview,
        deep_link: `/dashboard/chat/${message.conversation_id}`,
      })
    )
  );

  const sent = perUser.reduce((sum, r) => sum + r.sent, 0);
  const failed = perUser.reduce((sum, r) => sum + r.failed, 0);
  if (failed > 0) console.error(`send-push (message): ${failed} send(s) failed`);

  res.json({ success: true, sent, failed });
}

async function handleContactRequestPush(contact: any, res: VercelResponse) {
  // Only the initial request, not later status changes — Supabase Database
  // Webhooks only fire this on INSERT anyway, but this guards against the
  // webhook config accidentally including Update too.
  if (!contact || contact.status !== "pending") {
    return res.json({ skipped: true, reason: "not a new pending request" });
  }

  const { data: requester } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username")
    .eq("id", contact.requester_id)
    .maybeSingle();

  const requesterName = requester?.display_name || requester?.username || "Someone";

  try {
    const { sent, failed } = await sendToUserTokens(contact.responder_id, {
      type: "friend_request",
      requesterId: contact.requester_id,
      title: "Friend Request",
      body: `${requesterName} sent you a friend request`,
      deep_link: "/dashboard/notifications",
    });
    if (sent === 0 && failed === 0) return res.json({ skipped: true, reason: "recipient has no registered device token" });
    res.json({ success: true, sent, failed });
  } catch (error: any) {
    console.error("send-push (contact request): FCM send failed", error);
    res.status(500).json({ error: "Failed to send push" });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (req.headers["x-webhook-secret"] !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = req.body;
  const record = payload?.record;

  if (payload?.table === "calls") return handleCallPush(record, res);
  if (payload?.table === "messages") return handleMessagePush(record, res);
  if (payload?.table === "contacts") return handleContactRequestPush(record, res);

  res.json({ skipped: true, reason: "unrecognized table" });
}
