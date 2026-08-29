import { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../auth.js";

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

const GEMINI_MODEL = process.env.AI_PERSONA_GEMINI_MODEL || "gemini-2.5-flash";
const GROQ_MODEL = process.env.AI_PERSONA_GROQ_MODEL || "llama-3.3-70b-versatile";
const MAX_CONTEXT_MESSAGES = 20;
const DAILY_MESSAGE_LIMIT = 50;

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
