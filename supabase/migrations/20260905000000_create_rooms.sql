-- Personal rooms: a user creates a permanent group room, invites contacts
-- or lets others send a join request (owner approves/rejects), and members
-- chat in realtime (text + emoji). Group voice calling on top of this is a
-- follow-up piece, not part of this migration.

CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    room_code TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role TEXT CHECK (role IN ('owner', 'member')) DEFAULT 'member',
    -- invited: owner invited them, awaiting their accept
    -- pending: user asked to join, awaiting owner approval
    -- active:  in the room
    -- rejected: invite declined or join request denied
    -- left:    was active, left/removed
    status TEXT CHECK (status IN ('invited', 'pending', 'active', 'rejected', 'left')) NOT NULL DEFAULT 'pending',
    invited_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE (room_id, user_id)
);

CREATE TABLE public.room_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content_type TEXT CHECK (content_type IN ('text', 'emoji')) NOT NULL DEFAULT 'text',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_room_members_room ON public.room_members(room_id);
CREATE INDEX idx_room_members_user ON public.room_members(user_id);
CREATE INDEX idx_room_messages_room_created ON public.room_messages(room_id, created_at);

-- ==========================================
-- Helper functions (SECURITY DEFINER so RLS
-- policies on room_members can reference it
-- without recursive-policy evaluation).
-- ==========================================

CREATE OR REPLACE FUNCTION public.is_room_owner(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms WHERE id = p_room_id AND owner_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_active_room_member(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = p_user_id AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_room_participant(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==========================================
-- RLS
-- ==========================================

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;

-- rooms
CREATE POLICY "Room visible to owner and any participant" ON public.rooms
    FOR SELECT USING (
        auth.uid() = owner_id OR public.is_room_participant(id, auth.uid())
    );

CREATE POLICY "Users can create their own room" ON public.rooms
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner can update own room" ON public.rooms
    FOR UPDATE USING (auth.uid() = owner_id);

-- room_members
CREATE POLICY "Members and owner can view roster" ON public.room_members
    FOR SELECT USING (
        auth.uid() = user_id
        OR public.is_room_owner(room_id, auth.uid())
        OR public.is_active_room_member(room_id, auth.uid())
    );

CREATE POLICY "Join request or owner invite" ON public.room_members
    FOR INSERT WITH CHECK (
        (auth.uid() = user_id AND status = 'pending')
        OR (public.is_room_owner(room_id, auth.uid()) AND status = 'invited' AND invited_by = auth.uid())
    );

CREATE POLICY "Owner manages roster, user manages own row" ON public.room_members
    FOR UPDATE USING (
        public.is_room_owner(room_id, auth.uid()) OR auth.uid() = user_id
    );

-- room_messages
CREATE POLICY "Active members can read room messages" ON public.room_messages
    FOR SELECT USING (public.is_active_room_member(room_id, auth.uid()));

CREATE POLICY "Active members can send room messages" ON public.room_messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND public.is_active_room_member(room_id, auth.uid())
    );

-- ==========================================
-- Triggers
-- ==========================================

-- Owner is auto-added as an active member when a room is created.
CREATE OR REPLACE FUNCTION public.handle_room_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.room_members (room_id, user_id, role, status, responded_at)
    VALUES (NEW.id, NEW.owner_id, 'owner', 'active', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_room_created
AFTER INSERT ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.handle_room_created();

-- Notify on new invite / new join request.
CREATE OR REPLACE FUNCTION public.handle_room_member_inserted()
RETURNS TRIGGER AS $$
DECLARE
  room_name TEXT;
  requester_name TEXT;
  room_owner UUID;
BEGIN
  SELECT name, owner_id INTO room_name, room_owner FROM public.rooms WHERE id = NEW.room_id;

  IF NEW.status = 'pending' THEN
    SELECT COALESCE(display_name, username) INTO requester_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (room_owner, 'Room join request', requester_name || ' wants to join "' || room_name || '"', 'room_join_request', NEW.room_id);
  ELSIF NEW.status = 'invited' THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (NEW.user_id, 'Room invite', 'You were invited to join "' || room_name || '"', 'room_invite', NEW.room_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_room_member_inserted
AFTER INSERT ON public.room_members
FOR EACH ROW EXECUTE FUNCTION public.handle_room_member_inserted();

-- Notify on approve / reject / accept.
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
  ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (NEW.user_id, 'Join request declined', 'Your request to join "' || room_name || '" was declined', 'room_join_rejected', NEW.room_id);
  ELSIF NEW.status = 'active' AND OLD.status = 'invited' THEN
    SELECT COALESCE(display_name, username) INTO member_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (room_owner, 'Invite accepted', member_name || ' joined "' || room_name || '"', 'room_invite_accepted', NEW.room_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_room_member_updated
AFTER UPDATE ON public.room_members
FOR EACH ROW EXECUTE FUNCTION public.handle_room_member_updated();

-- ==========================================
-- RPC: look up a room by its join code without exposing the whole
-- rooms table via RLS (used by the "join by code" flow).
-- ==========================================

CREATE OR REPLACE FUNCTION public.find_room_by_code(p_code TEXT)
RETURNS TABLE (id UUID, name TEXT, description TEXT, owner_name TEXT, member_count BIGINT, my_status TEXT) AS $$
  SELECT
    r.id,
    r.name,
    r.description,
    COALESCE(p.display_name, p.username),
    (SELECT COUNT(*) FROM public.room_members rm WHERE rm.room_id = r.id AND rm.status = 'active'),
    (SELECT rm2.status FROM public.room_members rm2 WHERE rm2.room_id = r.id AND rm2.user_id = auth.uid())
  FROM public.rooms r
  JOIN public.profiles p ON p.id = r.owner_id
  WHERE r.room_code = UPPER(p_code) AND r.is_active = TRUE;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==========================================
-- Realtime
-- ==========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
  END IF;
END $$;
