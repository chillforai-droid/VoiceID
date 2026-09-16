-- ============================================================
-- Creator Rooms — extends the existing rooms/room_members
-- infrastructure (does not duplicate it). A "creator room" is
-- just a normal room with room_type = 'creator' plus branding
-- fields and a moderator role.
-- ============================================================

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'normal' CHECK (room_type IN ('normal', 'creator')),
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS rules TEXT,
  ADD COLUMN IF NOT EXISTS creator_display_name TEXT,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_rooms_creator ON public.rooms(room_type) WHERE room_type = 'creator';
CREATE INDEX IF NOT EXISTS idx_rooms_featured ON public.rooms(is_featured) WHERE is_featured = TRUE;

-- room_members: add a moderator role and mute/ban flags. status keeps
-- its existing values/meaning untouched (nothing that reads status
-- today needs to change) — mute/ban are separate flags layered on top.
ALTER TABLE public.room_members DROP CONSTRAINT room_members_role_check;
ALTER TABLE public.room_members ADD CONSTRAINT room_members_role_check CHECK (role IN ('owner', 'moderator', 'member'));

ALTER TABLE public.room_members
  ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.is_room_moderator(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = p_user_id AND role IN ('owner', 'moderator') AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==========================================
-- Real, DB-enforced authorization for moderation (not just UI hiding):
--   - only the owner may change anyone's role (assign/unassign moderator)
--   - only owner/moderator may change someone ELSE's status/mute/ban,
--     and never the owner's own row
--   - anyone may still update their own row (e.g. leaving the room)
-- ==========================================
CREATE OR REPLACE FUNCTION public.enforce_room_moderation_permissions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_room_owner(NEW.room_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the room owner can change member roles';
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.is_muted IS DISTINCT FROM OLD.is_muted
      OR NEW.is_banned IS DISTINCT FROM OLD.is_banned)
     AND auth.uid() != OLD.user_id THEN
    IF NOT public.is_room_moderator(NEW.room_id, auth.uid()) THEN
      RAISE EXCEPTION 'Not authorized to moderate this member';
    END IF;
    IF OLD.role = 'owner' THEN
      RAISE EXCEPTION 'Cannot moderate the room owner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_room_member_permissions ON public.room_members;
CREATE TRIGGER enforce_room_member_permissions
BEFORE UPDATE ON public.room_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_room_moderation_permissions();

-- Muted members stay active (still read/see the room) but can't send.
CREATE OR REPLACE FUNCTION public.can_send_room_message(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_active_room_member(p_room_id, p_user_id)
    AND NOT COALESCE((SELECT is_muted FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id), FALSE)
    AND (
      public.is_room_owner(p_room_id, p_user_id)
      OR NOT COALESCE((SELECT chat_locked FROM public.rooms WHERE id = p_room_id), FALSE)
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Message deletion: sender can delete their own; owner/moderator can
-- delete anyone's. There was previously no DELETE policy at all (so
-- deletion was silently blocked for everyone) — this is additive.
CREATE POLICY "Sender or moderator can delete room messages" ON public.room_messages
    FOR DELETE USING (
        auth.uid() = sender_id OR public.is_room_moderator(room_id, auth.uid())
    );

-- A banned user's old membership row still exists (UNIQUE(room_id,
-- user_id) blocks a fresh INSERT), but find_room_by_code should say so
-- clearly instead of the client just seeing a raw constraint-violation
-- error.
CREATE OR REPLACE FUNCTION public.find_room_by_code(p_code TEXT)
RETURNS TABLE (id UUID, name TEXT, description TEXT, owner_name TEXT, member_count BIGINT, my_status TEXT, is_banned BOOLEAN) AS $$
  SELECT
    r.id,
    r.name,
    r.description,
    COALESCE(p.display_name, p.username),
    (SELECT COUNT(*) FROM public.room_members rm WHERE rm.room_id = r.id AND rm.status = 'active'),
    (SELECT rm2.status FROM public.room_members rm2 WHERE rm2.room_id = r.id AND rm2.user_id = auth.uid()),
    COALESCE((SELECT rm3.is_banned FROM public.room_members rm3 WHERE rm3.room_id = r.id AND rm3.user_id = auth.uid()), FALSE)
  FROM public.rooms r
  JOIN public.profiles p ON p.id = r.owner_id
  WHERE r.room_code = UPPER(p_code) AND r.is_active = TRUE;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==========================================
-- Creator room discovery (mirrors list_public_rooms, filtered to
-- room_type = 'creator')
-- ==========================================
CREATE OR REPLACE FUNCTION public.list_creator_rooms(p_category TEXT DEFAULT NULL, p_search TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID, name TEXT, description TEXT, category TEXT, avatar_url TEXT, cover_url TEXT,
  creator_display_name TEXT, owner_name TEXT, member_count BIGINT, is_featured BOOLEAN,
  my_status TEXT, created_at TIMESTAMPTZ
) AS $$
  SELECT
    r.id, r.name, r.description, r.category, r.avatar_url, r.cover_url,
    r.creator_display_name, COALESCE(p.display_name, p.username),
    (SELECT COUNT(*) FROM public.room_members rm WHERE rm.room_id = r.id AND rm.status = 'active'),
    r.is_featured,
    (SELECT rm2.status FROM public.room_members rm2 WHERE rm2.room_id = r.id AND rm2.user_id = auth.uid()),
    r.created_at
  FROM public.rooms r
  JOIN public.profiles p ON p.id = r.owner_id
  WHERE r.is_public = TRUE AND r.is_active = TRUE AND r.room_type = 'creator'
    AND (p_category IS NULL OR r.category = p_category)
    AND (p_search IS NULL OR r.name ILIKE '%' || p_search || '%' OR r.creator_display_name ILIKE '%' || p_search || '%')
  ORDER BY r.is_featured DESC, r.created_at DESC
  LIMIT 50;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==========================================
-- Room analytics events — architecture kept clean/scalable for a future
-- standalone admin panel to read from directly.
-- ==========================================
CREATE TABLE public.room_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('room_view', 'room_join', 'room_leave', 'message_sent', 'member_removed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_room_events_room_type_created ON public.room_events(room_id, event_type, created_at);

ALTER TABLE public.room_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log their own room event" ON public.room_events
    FOR INSERT WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Owner or moderator can read room events" ON public.room_events
    FOR SELECT USING (public.is_room_moderator(room_id, auth.uid()));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_events;
  END IF;
END $$;

-- Auto-log message_sent — no client round trip needed for this one.
CREATE OR REPLACE FUNCTION public.log_room_message_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.room_events (room_id, user_id, event_type) VALUES (NEW.room_id, NEW.sender_id, 'message_sent');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_room_message_sent_event ON public.room_messages;
CREATE TRIGGER on_room_message_sent_event
AFTER INSERT ON public.room_messages
FOR EACH ROW EXECUTE FUNCTION public.log_room_message_event();

-- Extend the existing room_members UPDATE trigger to also log
-- room_join / room_leave / member_removed, alongside the notifications
-- it already sends (unchanged).
CREATE OR REPLACE FUNCTION public.handle_room_member_updated()
RETURNS TRIGGER AS $$
DECLARE
  room_name TEXT;
  room_owner UUID;
  member_name TEXT;
BEGIN
  SELECT name, owner_id INTO room_name, room_owner FROM public.rooms WHERE id = NEW.room_id;

  IF NEW.status = 'active' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (NEW.user_id, 'Join request approved', 'You joined "' || room_name || '"', 'room_join_approved', NEW.room_id);
    INSERT INTO public.room_events (room_id, user_id, event_type) VALUES (NEW.room_id, NEW.user_id, 'room_join');
  ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (NEW.user_id, 'Join request declined', 'Your request to join "' || room_name || '" was declined', 'room_join_rejected', NEW.room_id);
  ELSIF NEW.status = 'active' AND OLD.status = 'invited' THEN
    SELECT COALESCE(display_name, username) INTO member_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (room_owner, 'Invite accepted', member_name || ' joined "' || room_name || '"', 'room_invite_accepted', NEW.room_id);
    INSERT INTO public.room_events (room_id, user_id, event_type) VALUES (NEW.room_id, NEW.user_id, 'room_join');
  ELSIF NEW.status = 'left' AND OLD.status = 'active' THEN
    INSERT INTO public.room_events (room_id, user_id, event_type)
    VALUES (NEW.room_id, NEW.user_id, CASE WHEN auth.uid() = NEW.user_id THEN 'room_leave' ELSE 'member_removed' END);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Basic aggregate stats for the room owner/moderator's dashboard. Gated
-- inside the function itself (WHERE clause on a permission check) so it
-- simply returns no row for anyone unauthorized, rather than needing a
-- separate grant.
CREATE OR REPLACE FUNCTION public.get_room_stats(p_room_id UUID)
RETURNS TABLE (
  total_members BIGINT,
  new_members_7d BIGINT,
  total_messages BIGINT,
  messages_7d BIGINT,
  room_views BIGINT,
  active_members_7d BIGINT
) AS $$
  SELECT
    (SELECT COUNT(*) FROM public.room_members WHERE room_id = p_room_id AND status = 'active'),
    (SELECT COUNT(*) FROM public.room_members WHERE room_id = p_room_id AND status = 'active' AND created_at > NOW() - INTERVAL '7 days'),
    (SELECT COUNT(*) FROM public.room_messages WHERE room_id = p_room_id),
    (SELECT COUNT(*) FROM public.room_messages WHERE room_id = p_room_id AND created_at > NOW() - INTERVAL '7 days'),
    (SELECT COUNT(*) FROM public.room_events WHERE room_id = p_room_id AND event_type = 'room_view'),
    (SELECT COUNT(DISTINCT sender_id) FROM public.room_messages WHERE room_id = p_room_id AND created_at > NOW() - INTERVAL '7 days')
  WHERE public.is_room_moderator(p_room_id, auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==========================================
-- Member roster for the manage screen — includes profile + moderation
-- fields in one call (mirrors the pattern used elsewhere in this file
-- rather than a PostgREST embed).
-- ==========================================
CREATE OR REPLACE FUNCTION public.list_room_members_for_management(p_room_id UUID)
RETURNS TABLE (
  member_row_id UUID, user_id UUID, username TEXT, display_name TEXT, avatar_url TEXT,
  role TEXT, status TEXT, is_muted BOOLEAN, is_banned BOOLEAN, joined_at TIMESTAMPTZ
) AS $$
  SELECT rm.id, rm.user_id, p.username, p.display_name, p.avatar_url,
         rm.role, rm.status, rm.is_muted, rm.is_banned, COALESCE(rm.responded_at, rm.created_at)
  FROM public.room_members rm
  JOIN public.profiles p ON p.id = rm.user_id
  WHERE rm.room_id = p_room_id AND rm.status = 'active'
    AND public.is_room_moderator(p_room_id, auth.uid())
  ORDER BY CASE rm.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, rm.responded_at ASC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
