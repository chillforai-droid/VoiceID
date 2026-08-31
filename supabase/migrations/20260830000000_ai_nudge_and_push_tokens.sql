-- push_tokens previously had `user_id` alone as the primary key, so a user
-- with both the Android app and the website could only ever have ONE
-- registered device — the second one to register would silently overwrite
-- the first, breaking push notifications on whichever surface lost. Now
-- that the website itself can register for push (see src/lib/webPush.ts),
-- both need to coexist.
ALTER TABLE public.push_tokens DROP CONSTRAINT push_tokens_pkey;
ALTER TABLE public.push_tokens ADD PRIMARY KEY (user_id, platform);

-- Finds every (human user, AI persona) conversation pair where the AI
-- hasn't sent anything in the last few hours — used by the AI check-in
-- "nudge" endpoint (api/ai-reply.ts?mode=nudge) so an external scheduler
-- hitting that URL a few times a day naturally produces a few check-in
-- messages a day per user, without needing a separate counter table.
CREATE OR REPLACE FUNCTION public.get_ai_nudge_candidates(hours_since_last_ai_message INT DEFAULT 6)
RETURNS TABLE (
  human_id UUID,
  ai_id UUID,
  ai_display_name TEXT,
  ai_persona TEXT,
  conversation_id UUID
) AS $$
  SELECT
    human.id AS human_id,
    ai.id AS ai_id,
    ai.display_name AS ai_display_name,
    ai.ai_persona AS ai_persona,
    cm_human.conversation_id
  FROM public.conversation_members cm_human
  JOIN public.profiles human ON human.id = cm_human.user_id AND human.is_ai = false
  JOIN public.conversation_members cm_ai
    ON cm_ai.conversation_id = cm_human.conversation_id AND cm_ai.user_id != cm_human.user_id
  JOIN public.profiles ai ON ai.id = cm_ai.user_id AND ai.is_ai = true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.conversation_id = cm_human.conversation_id
      AND m.sender_id = ai.id
      AND m.created_at > now() - (hours_since_last_ai_message || ' hours')::interval
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
