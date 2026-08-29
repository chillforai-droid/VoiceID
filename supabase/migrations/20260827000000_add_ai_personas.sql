-- AI companion personas: two fixed "users" (a girl persona and a boy
-- persona) that anyone can chat with, backed by an LLM.
--
-- profiles.id has a hard FK to auth.users(id) (see init schema), so a bot
-- can't just be an arbitrary profiles row — it needs a real auth.users
-- account first. That account is created by scripts/create-ai-personas.ts
-- using the service-role key (supabase.auth.admin.createUser), which is
-- the only supported way to create an auth user outside of normal signup.
-- This migration only adds the columns/table that script and the reply
-- endpoint (api/ai-reply.ts) depend on.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_ai BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_persona TEXT;

-- Keeps the AI's system prompt out of any query the client is allowed to
-- run (only is_ai needs to be visible client-side, to show an "AI" badge
-- and disable calling). Since ai_persona shouldn't be readable by the
-- browser at all, it's simplest to never SELECT it from the client and
-- only read it server-side with the service-role key — RLS on profiles
-- already restricts to authenticated users, which is enough here since
-- the real protection is "the client code just never selects that column".

-- One row per (user, calendar day) — used to cap how many AI replies a
-- given user can trigger per day, so a single person can't run up the
-- LLM API bill.
CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
    message_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Read-only for the owning user (so the client can show "X/50 messages
-- used today" if you want); all writes happen server-side only, via the
-- service-role key in api/ai-reply.ts, so there's no INSERT/UPDATE policy.
DROP POLICY IF EXISTS "Users can view own AI usage" ON public.ai_usage_daily;
CREATE POLICY "Users can view own AI usage" ON public.ai_usage_daily
    FOR SELECT USING (auth.uid() = user_id);
