-- Two owner-controlled room settings:
--   chat_locked      -> when true, only the owner can send room_messages
--                        (everyone can still read/react)
--   video_embed_url   -> a single video URL the owner sets, shown as an
--                        embedded player in the room. We deliberately do
--                        NOT store or render arbitrary pasted <iframe> HTML
--                        (that would be an XSS vector — a hostile owner
--                        account, or a copy-pasted embed from a bad
--                        source, could inject a fake iframe with extra
--                        attributes or has no place being dropped into
--                        other members' pages via dangerouslySetInnerHTML).
--                        The client extracts just the src URL from
--                        whatever the owner pastes and stores that; the
--                        component always builds its own <iframe> around it.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS chat_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS video_embed_url TEXT;

CREATE OR REPLACE FUNCTION public.can_send_room_message(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_active_room_member(p_room_id, p_user_id)
    AND (
      public.is_room_owner(p_room_id, p_user_id)
      OR NOT COALESCE((SELECT chat_locked FROM public.rooms WHERE id = p_room_id), FALSE)
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY "Active members can send room messages" ON public.room_messages;
CREATE POLICY "Members can send room messages unless chat is locked" ON public.room_messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND public.can_send_room_message(room_id, auth.uid())
    );
