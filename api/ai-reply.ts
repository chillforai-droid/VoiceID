import { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../lib/auth.js";

/**
 * SETUP (one-time, in the Supabase dashboard — not something this file can
 * do on its own):
 *   Database → Webhooks → Create a new webhook
 *     Table: messages, Event: INSERT
 *     Type: HTTP Request, URL: https://<your-domain>/api/ai-reply
 *     HTTP Headers: Content-Type: application/json
 *   This makes Supabase POST every new message row here. The handler below
 *   ignores anything that isn't a message *to* an AI persona, so it's safe
 *   to fire on every message in the app.
 *
 * Uses two free-tier LLM APIs, Gemini first and Groq as a fallback if
 * Gemini errors or is rate-limited:
 *   - GEMINI_API_KEY  — free, no card required: https://aistudio.google.com/apikey
 *   - GROQ_API_KEY    — free, no card required: https://console.groq.com/keys
 * Set both as Vercel environment variables. At least one is required;
 * having both means a Gemini outage/rate-limit doesn't take the personas
 * down entirely.
 */

const GEMINI_MODEL = process.env.AI_PERSONA_GEMINI_MODEL || "gemini-3.1-flash-lite";
const GROQ_MODEL = process.env.AI_PERSONA_GROQ_MODEL || "llama-3.3-70b-versatile";
const MAX_CONTEXT_MESSAGES = 20;
const DAILY_MESSAGE_LIMIT = 50;
// A "nudge" run processes at most this many candidates per invocation, to
// stay comfortably inside Vercel Hobby's 10-second function timeout (each
// candidate costs one LLM call + a couple of DB round-trips). An external
// scheduler hitting ?mode=nudge a few times a day (see handleNudgeMode
// below) means anyone not reached in one run gets picked up a few hours
// later in the next one — fine for a small user base; if this app grows
// past what 3 runs/day can cover, that's a sign to move the LLM calls to
// a queue instead of processing them inline here.
const MAX_NUDGES_PER_RUN = 8;

interface WebhookPayload {
  type: string;
  table: string;
  record: {
    id: string;
    conversation_id: string;
    sender_id: string;
    content_body: string;
    content_type: string;
  };
}

type LlmMessage = { role: "user" | "assistant"; content: string };

async function callGemini(persona: string, messages: LlmMessage[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: persona }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: 300 },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini API returned ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("")?.trim();
  if (!text) throw new Error("Gemini API returned no text content");
  return text;
}

async function callGroq(persona: string, messages: LlmMessage[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 300,
      messages: [{ role: "system", content: persona }, ...messages],
    }),
  });

  if (!res.ok) throw new Error(`Groq API returned ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq API returned no text content");
  return text;
}

/** Tries Gemini first, falls back to Groq if Gemini errors or isn't configured. */
async function generateReply(persona: string, messages: LlmMessage[]): Promise<string> {
  try {
    return await callGemini(persona, messages);
  } catch (geminiErr) {
    console.error("ai-reply: Gemini call failed, falling back to Groq", geminiErr);
    return await callGroq(persona, messages);
  }
}

/**
 * AI check-in "nudge" mode — what gets a user a proactive message from an
 * AI persona a few times a day, so there's a reason to open the app/site
 * even when nobody's messaged them. This is NOT a Vercel Cron job: Vercel
 * Hobby only allows once-a-day cron schedules (see Vercel's cron-jobs
 * docs), which can't do "3x/day" on its own. Instead, point a free
 * external scheduler (e.g. cron-job.org — no card required) at this URL
 * 3 times a day:
 *
 *   https://<your-domain>/api/ai-reply?mode=nudge&secret=<AI_NUDGE_SECRET>
 *
 * AI_NUDGE_SECRET is a Vercel env var you make up yourself (any random
 * string) — it exists purely so a stranger who finds this URL can't spam
 * every user with AI messages and burn your free LLM quota. Set the same
 * value in both places.
 *
 * Each run only messages users the AI hasn't messaged in the last few
 * hours (via the get_ai_nudge_candidates DB function), so calling this
 * 3x/day naturally produces roughly 3 check-ins/day/user, not a flood —
 * no separate "have I sent 3 today" counter needed.
 */
async function handleNudgeMode(req: VercelRequest, res: VercelResponse) {
  const secret = (req.query.secret as string) || (req.headers["x-nudge-secret"] as string);
  if (!process.env.AI_NUDGE_SECRET || secret !== process.env.AI_NUDGE_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
    return res.status(200).json({ skipped: true, reason: "no_api_key" });
  }

  const { data: candidates, error } = await supabaseAdmin.rpc("get_ai_nudge_candidates", {
    hours_since_last_ai_message: 6,
  });

  if (error || !candidates) {
    console.error("ai-reply (nudge): failed to load candidates", error);
    return res.status(200).json({ error: "candidates_query_failed" });
  }

  const batch = candidates.slice(0, MAX_NUDGES_PER_RUN);
  let sent = 0;
  let failed = 0;

  for (const c of batch) {
    try {
      const { data: history } = await supabaseAdmin
        .from("messages")
        .select("sender_id, content_body, content_type")
        .eq("conversation_id", c.conversation_id)
        .order("created_at", { ascending: false })
        .limit(10);

      const llmMessages: LlmMessage[] = (history || [])
        .slice()
        .reverse()
        .map((m) => ({
          role: (m.sender_id === c.ai_id ? "assistant" : "user") as LlmMessage["role"],
          content: m.content_type === "text" ? (m.content_body || "") : `[sent ${m.content_type === "image" ? "a photo" : "a voice message"}]`,
        }))
        .filter((m) => m.content.trim().length > 0);

      const nudgeInstruction =
        "\n\nRight now you're proactively checking in on the user because they haven't chatted with you in a while \u2014 this isn't a reply to anything they said. Send a short, warm, casual check-in message (1-2 sentences) inviting them to chat. Don't mention that you're doing a scheduled check-in.";

      const replyText = await generateReply((c.ai_persona || "") + nudgeInstruction, llmMessages);

      const { error: insertError } = await supabaseAdmin.from("messages").insert({
        conversation_id: c.conversation_id,
        sender_id: c.ai_id,
        content_body: replyText,
        content_type: "text",
      });

      if (insertError) {
        console.error("ai-reply (nudge): failed to insert message", insertError);
        failed++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error("ai-reply (nudge): failed for candidate", c.human_id, c.ai_id, err);
      failed++;
    }
  }

  res.status(200).json({ success: true, candidates: candidates.length, processed: batch.length, sent, failed });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.query.mode === "nudge") return handleNudgeMode(req, res);

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const payload = req.body as WebhookPayload;
    const message = payload?.record;
    if (!message || payload.table !== "messages") return res.status(200).json({ skipped: true });

    // Find who else is in this conversation — if it's not an AI persona,
    // this endpoint has nothing to do.
    const { data: members, error: membersError } = await supabaseAdmin
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", message.conversation_id);

    if (membersError || !members) {
      console.error("ai-reply: failed to load conversation members", membersError);
      return res.status(200).json({ skipped: true });
    }

    const otherUserId = members.map((m) => m.user_id).find((id) => id !== message.sender_id);
    if (!otherUserId) return res.status(200).json({ skipped: true });

    const { data: aiProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, is_ai, ai_persona, display_name")
      .eq("id", otherUserId)
      .maybeSingle();

    if (!aiProfile?.is_ai) return res.status(200).json({ skipped: true }); // not a chat with an AI persona
    if (message.sender_id === aiProfile.id) return res.status(200).json({ skipped: true }); // avoid replying to itself

    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
      console.error("ai-reply: neither GEMINI_API_KEY nor GROQ_API_KEY is set");
      return res.status(200).json({ skipped: true, reason: "no_api_key" });
    }

    // Rate limit: cap replies per human user per day so one person can't
    // run up the LLM API bill. Keyed on the human, not the AI.
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await supabaseAdmin
      .from("ai_usage_daily")
      .select("message_count")
      .eq("user_id", message.sender_id)
      .eq("usage_date", today)
      .maybeSingle();

    const currentCount = usage?.message_count || 0;
    if (currentCount >= DAILY_MESSAGE_LIMIT) {
      await supabaseAdmin.from("messages").insert({
        conversation_id: message.conversation_id,
        sender_id: aiProfile.id,
        content_body: "You've hit today's message limit with me \u2014 let's continue tomorrow!",
        content_type: "text",
      });
      return res.status(200).json({ skipped: true, reason: "rate_limited" });
    }

    await supabaseAdmin
      .from("ai_usage_daily")
      .upsert(
        { user_id: message.sender_id, usage_date: today, message_count: currentCount + 1 },
        { onConflict: "user_id,usage_date" }
      );

    // Build conversation context for the model.
    const { data: history, error: historyError } = await supabaseAdmin
      .from("messages")
      .select("sender_id, content_body, content_type")
      .eq("conversation_id", message.conversation_id)
      .order("created_at", { ascending: false })
      .limit(MAX_CONTEXT_MESSAGES);

    if (historyError || !history) {
      console.error("ai-reply: failed to load message history", historyError);
      return res.status(200).json({ skipped: true });
    }

    const llmMessages: LlmMessage[] = history
      .slice()
      .reverse()
      .map((m) => ({
        role: (m.sender_id === aiProfile.id ? "assistant" : "user") as LlmMessage["role"],
        content: m.content_type === "text" ? (m.content_body || "") : `[sent ${m.content_type === "image" ? "a photo" : "a voice message"}]`,
      }))
      .filter((m) => m.content.trim().length > 0);

    if (llmMessages.length === 0) return res.status(200).json({ skipped: true });

    let replyText: string;
    try {
      replyText = await generateReply(aiProfile.ai_persona, llmMessages);
    } catch (err) {
      console.error("ai-reply: both Gemini and Groq failed", err);
      // Insert a friendly fallback instead of leaving the user's message
      // unanswered with no explanation.
      await supabaseAdmin.from("messages").insert({
        conversation_id: message.conversation_id,
        sender_id: aiProfile.id,
        content_body: "Sorry, I'm having trouble replying right now \u2014 try again in a bit?",
        content_type: "text",
      });
      return res.status(200).json({ error: "llm_failed" });
    }

    const { error: insertError } = await supabaseAdmin.from("messages").insert({
      conversation_id: message.conversation_id,
      sender_id: aiProfile.id,
      content_body: replyText,
      content_type: "text",
    });

    if (insertError) {
      console.error("ai-reply: failed to insert reply message", insertError);
      return res.status(500).json({ error: "insert_failed" });
    }

    res.status(200).json({ success: true });
  } catch (e: any) {
    console.error("ai-reply: unexpected error", e);
    res.status(200).json({ error: e?.message }); // 200 so Supabase doesn't retry-storm on a bug
  }
}
