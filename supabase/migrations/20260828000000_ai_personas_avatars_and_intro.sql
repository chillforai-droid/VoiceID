-- Run this AFTER scripts/create-ai-personas.ts has created the two AI
-- profile rows (priya_ai, arjun_ai) — this migration references them by
-- username and does nothing if they don't exist yet.

-- Illustrated (non-photorealistic) avatars via the free DiceBear API, so
-- the AI profiles look distinct and attractive without using a real or
-- fake-realistic human photo. Deterministic per seed, no hosting needed.
UPDATE public.profiles
SET avatar_url = 'https://api.dicebear.com/10.x/adventurer/svg?seed=priya_ai&backgroundColor=ffd5dc,ffdfbf&radius=50'
WHERE username = 'priya_ai' AND is_ai = true;

UPDATE public.profiles
SET avatar_url = 'https://api.dicebear.com/10.x/adventurer/svg?seed=arjun_ai&backgroundColor=b6e3f4,c0aede&radius=50'
WHERE username = 'arjun_ai' AND is_ai = true;

-- Auto-introduce every human user to both AI personas going forward: the
-- moment a profile row is created, a conversation (+ a friendly opening
-- message) is set up with each AI persona, and they're added as an
-- accepted contact. This is what makes them show up immediately in the
-- dashboard/conversation list for every new signup, with nothing for the
-- user to search for or add manually.
CREATE OR REPLACE FUNCTION public.voiceid_introduce_ai_personas()
RETURNS TRIGGER AS $$
DECLARE
  persona RECORD;
  new_conv_id UUID;
BEGIN
  IF NEW.is_ai THEN
    RETURN NEW; -- don't introduce AI personas to each other
  END IF;

  FOR persona IN SELECT id, display_name FROM public.profiles WHERE is_ai = true LOOP
    INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO new_conv_id;

    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (new_conv_id, NEW.id), (new_conv_id, persona.id);

    INSERT INTO public.contacts (requester_id, responder_id, status)
    VALUES (persona.id, NEW.id, 'accepted');

    INSERT INTO public.messages (conversation_id, sender_id, content_body, content_type)
    VALUES (
      new_conv_id,
      persona.id,
      'Hey! I''m ' || persona.display_name || ' — an AI on VoiceID. Say hi any time :)',
      'text'
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS voiceid_on_profile_created_introduce_ai ON public.profiles;
CREATE TRIGGER voiceid_on_profile_created_introduce_ai
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.voiceid_introduce_ai_personas();

-- Backfill: the trigger above only covers signups from now on, so this
-- does the same introduction for every EXISTING human user, skipping
-- anyone who already somehow has a conversation with that persona (safe
-- to re-run).
DO $$
DECLARE
  u RECORD;
  persona RECORD;
  new_conv_id UUID;
BEGIN
  FOR u IN SELECT id FROM public.profiles WHERE is_ai = false LOOP
    FOR persona IN SELECT id, display_name FROM public.profiles WHERE is_ai = true LOOP
      IF EXISTS (
        SELECT 1 FROM public.conversation_members cm1
        JOIN public.conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
        WHERE cm1.user_id = u.id AND cm2.user_id = persona.id
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO new_conv_id;
      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (new_conv_id, u.id), (new_conv_id, persona.id);

      IF NOT EXISTS (
        SELECT 1 FROM public.contacts
        WHERE (requester_id = persona.id AND responder_id = u.id)
           OR (requester_id = u.id AND responder_id = persona.id)
      ) THEN
        INSERT INTO public.contacts (requester_id, responder_id, status)
        VALUES (persona.id, u.id, 'accepted');
      END IF;

      INSERT INTO public.messages (conversation_id, sender_id, content_body, content_type)
      VALUES (
        new_conv_id,
        persona.id,
        'Hey! I''m ' || persona.display_name || ' — an AI on VoiceID. Say hi any time :)',
        'text'
      );
    END LOOP;
  END LOOP;
END $$;
