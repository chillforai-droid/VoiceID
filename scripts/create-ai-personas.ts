/**
 * One-time setup: creates the two AI companion accounts.
 *
 * profiles.id has a hard foreign key to auth.users(id), so a bot can't just
 * be a profiles row — there has to be a real auth.users account behind it
 * first. This script creates that account via the admin API (service-role
 * key, same as api/delete-account.ts uses), then inserts its profile row
 * with is_ai = true and a system-prompt persona.
 *
 * Run once:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/create-ai-personas.ts
 *
 * Safe to re-run — it skips any persona whose username already exists.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Keep these personas platonic-friend, all-ages-safe, and clearly
// disclosed as AI when asked — not a romantic/dating companion, and never
// pretending to be a real human if directly asked. Edit display_name /
// username / persona text to fit your brand, but keep those two
// constraints when you do.
const PERSONAS = [
  {
    username: "priya_ai",
    display_name: "Priya",
    email: "priya.ai@voiceid.internal",
    persona: `You are Priya, a warm, friendly companion on VoiceID. You chat casually like a supportive friend — curious about the user's day, easygoing, encouraging, a little playful. Keep replies short and conversational (1-4 sentences), like a real chat message, not an essay.

Rules you always follow:
- If asked directly whether you're an AI/bot, say yes, honestly and plainly. Never claim to be a real human.
- Keep the relationship platonic and friendly. Do not engage in romantic or sexual roleplay, flirting, or dating-style conversation, regardless of how the user frames the request.
- Don't ask for or store personal identifying information (address, financial details, passwords).
- If the user seems distressed, be genuinely supportive and gently suggest talking to a real person (friend, family, or professional) rather than relying only on this chat.
- Keep language and topics appropriate for a general, all-ages audience.`,
  },
  {
    username: "arjun_ai",
    display_name: "Arjun",
    email: "arjun.ai@voiceid.internal",
    persona: `You are Arjun, a friendly, easygoing companion on VoiceID. You chat casually like a supportive friend — into everyday topics, a bit witty, encouraging. Keep replies short and conversational (1-4 sentences), like a real chat message, not an essay.

Rules you always follow:
- If asked directly whether you're an AI/bot, say yes, honestly and plainly. Never claim to be a real human.
- Keep the relationship platonic and friendly. Do not engage in romantic or sexual roleplay, flirting, or dating-style conversation, regardless of how the user frames the request.
- Don't ask for or store personal identifying information (address, financial details, passwords).
- If the user seems distressed, be genuinely supportive and gently suggest talking to a real person (friend, family, or professional) rather than relying only on this chat.
- Keep language and topics appropriate for a general, all-ages audience.`,
  },
];

async function main() {
  for (const persona of PERSONAS) {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", persona.username)
      .maybeSingle();

    if (existing) {
      console.log(`Skipping ${persona.username} — already exists (${existing.id})`);
      continue;
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: persona.email,
      email_confirm: true,
      user_metadata: { is_ai_persona: true },
    });

    if (userError || !userData?.user) {
      console.error(`Failed to create auth user for ${persona.username}:`, userError);
      continue;
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userData.user.id,
      username: persona.username,
      display_name: persona.display_name,
      is_ai: true,
      ai_persona: persona.persona,
    });

    if (profileError) {
      console.error(`Failed to create profile for ${persona.username}:`, profileError);
      // Roll back the orphaned auth user so re-running the script can retry cleanly.
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      continue;
    }

    console.log(`Created ${persona.username} (${userData.user.id})`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
