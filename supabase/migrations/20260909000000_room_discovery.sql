-- Room discovery: an owner can mark their room public + tag it with a
-- category so it shows up in an Explore list. Joining a public room still
-- goes through the existing pending -> owner-approves flow (unchanged) —
-- this migration only makes the room *visible* to non-members, not
-- auto-joinable.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_rooms_public ON public.rooms(is_public) WHERE is_public = TRUE;

CREATE POLICY "Public active rooms are discoverable" ON public.rooms
    FOR SELECT USING (is_public = TRUE AND is_active = TRUE);

-- Listing for the Explore tab: room + owner name + live member count + the
-- viewer's own membership status, in one round trip, without exposing the
-- full rooms table via RLS the way a plain SELECT would need to.
CREATE OR REPLACE FUNCTION public.list_public_rooms(p_category TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category TEXT,
  owner_name TEXT,
  member_count BIGINT,
  my_status TEXT,
  created_at TIMESTAMPTZ
) AS $$
  SELECT
    r.id,
    r.name,
    r.description,
    r.category,
    COALESCE(p.display_name, p.username),
    (SELECT COUNT(*) FROM public.room_members rm WHERE rm.room_id = r.id AND rm.status = 'active'),
    (SELECT rm2.status FROM public.room_members rm2 WHERE rm2.room_id = r.id AND rm2.user_id = auth.uid()),
    r.created_at
  FROM public.rooms r
  JOIN public.profiles p ON p.id = r.owner_id
  WHERE r.is_public = TRUE
    AND r.is_active = TRUE
    AND (p_category IS NULL OR r.category = p_category)
  ORDER BY r.created_at DESC
  LIMIT 50;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
