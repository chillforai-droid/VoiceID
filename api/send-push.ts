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
 * Wiring (update BOTH webhooks in the Supabase Dashboard to point here):
 *   Database -> Webhooks -> table "calls", event "Insert" ->
 *     URL = https://<your-domain>/api/send-push
 *   Database -> Webhooks -> table "messages", event "Insert" ->
 *     URL = https://<your-domain>/api/send-push
 *   Both need header `x-webhook-secret: <SUPABASE_WEBHOOK_SECRET>`
 *   (must match the env var below).
 *
 * Silently does nothing for any recipient without a push_tokens row yet
 * (web-only users, or Android users who haven't opened the app since this
 * shipped) — the existing Realtime/in-app path keeps working exactly as
 * before regardless.
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

async function handleCallPush(call: any, res: VercelResponse) {
  if (!call || call.status !== "ringing") {
    return res.json({ skipped: true, reason: "not a new ringing call" });
  }

  const { data: tokenRow } = await supabaseAdmin
    .from("push_tokens")
    .select("token")
    .eq("user_id", call.receiver_id)
    .maybeSingle();

  if (!tokenRow?.token) {
    return res.json({ skipped: true, reason: "receiver has no registered device token" });
  }

  const { data: caller } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username")
    .eq("id", call.caller_id)
    .maybeSingle();

  ensureFirebaseInitialized();

  try {
    await getMessaging().send({
      token: tokenRow.token,
      // Data-only (no `notification` block) so Android always routes this to
      // VoiceIdFirebaseMessagingService.onMessageReceived(), even while
      // backgrounded — a `notification` block would instead let the OS
      // auto-display a generic system notification with no Accept/Reject
      // actions, which is exactly what this feature is replacing.
      data: {
        type: "incoming_call",
        callId: call.id,
        callerId: call.caller_id,
        callerName: caller?.display_name || caller?.username || "Unknown",
      },
      android: { priority: "high" },
    });
    res.json({ success: true });
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

  const { data: tokenRows } = await supabaseAdmin
    .from("push_tokens")
    .select("token")
    .in("user_id", members.map((m) => m.user_id));

  if (!tokenRows || tokenRows.length === 0) {
    return res.json({ skipped: true, reason: "no recipients have a registered device token" });
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

  ensureFirebaseInitialized();

  const results = await Promise.allSettled(
    tokenRows.map((row) =>
      getMessaging().send({
        token: row.token,
        data: {
          type: "new_message",
          conversationId: message.conversation_id,
          senderId: message.sender_id,
          senderName,
          title: senderName,
          body: preview,
          deep_link: `/dashboard/chat/${message.conversation_id}`,
        },
        android: { priority: "high" },
      })
    )
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.error(`send-push (message): ${failed}/${results.length} sends failed`);
  }

  res.json({ success: true, sent: results.length - failed, failed });
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

  res.json({ skipped: true, reason: "unrecognized table" });
}
