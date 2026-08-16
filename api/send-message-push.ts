import { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../lib/auth.js";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp, getApps, cert } from "firebase-admin/app";

/**
 * Wakes the Android app for a new message when it's backgrounded or fully killed —
 * same reasoning/wiring as send-call-push.ts, just triggered off `messages` instead
 * of `calls`. Supports group conversations by notifying every member of
 * `conversation_members` except the sender, not just a single receiver.
 *
 * Wiring: a Supabase Database Webhook on `messages`, event = INSERT, calls this
 * endpoint with the new row as { type: "INSERT", table: "messages", record: {...} }.
 * Configure it in the Supabase Dashboard: Database -> Webhooks -> Create a new hook ->
 * table "messages", events "Insert", type "HTTP Request",
 * URL = https://<your-domain>/api/send-message-push,
 * header `x-webhook-secret: <SUPABASE_WEBHOOK_SECRET>` (must match the env var below,
 * same secret already used for send-call-push).
 *
 * Silently does nothing for any recipient without a push_tokens row yet (web-only
 * users, or Android users who haven't opened the app since this shipped) — the
 * existing Realtime/in-app path keeps working exactly as before regardless.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    if (req.headers["x-webhook-secret"] !== process.env.SUPABASE_WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const message = req.body?.record;
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
        .in("user_id", members.map(m => m.user_id));

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
        message.content_type === "voice" ? "🎤 Voice message" :
        message.content_type === "image" ? "📷 Photo" :
        (message.content_body || "New message");

    if (getApps().length === 0) {
        // FIREBASE_SERVICE_ACCOUNT_KEY = the full service-account JSON (Firebase Console ->
        // Project settings -> Service accounts -> Generate new private key), stored as a
        // single-line env var in Vercel. Same one send-call-push.ts already uses.
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
        initializeApp({ credential: cert(serviceAccount) });
    }

    const results = await Promise.allSettled(
        tokenRows.map(row =>
            getMessaging().send({
                token: row.token,
                // Data-only, same reasoning as send-call-push.ts: lets the app
                // build its own notification (with the right deep link) instead
                // of the OS showing a generic one.
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

    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) {
        console.error(`send-message-push: ${failed}/${results.length} sends failed`);
    }

    res.json({ success: true, sent: results.length - failed, failed });
}
