-- Public vs private rooms now differ in more than discoverability:
--   public  -> anyone who requests to join is approved instantly
--   private -> owner still has to approve (unchanged pending flow)
-- Re-using is_public for this avoids a second column/flag.

CREATE OR REPLACE FUNCTION public.handle_room_member_inserted()
RETURNS TRIGGER AS $$
DECLARE
  room_name TEXT;
  requester_name TEXT;
  room_owner UUID;
  room_public BOOLEAN;
BEGIN
  SELECT name, owner_id, is_public INTO room_name, room_owner, room_public FROM public.rooms WHERE id = NEW.room_id;

  IF NEW.status = 'pending' AND room_public THEN
    -- Public room: skip the approval step entirely. The AFTER UPDATE
    -- trigger below fires from this and sends the same "you're in" /
    -- room_join_approved notification a manual approval would.
    UPDATE public.room_members SET status = 'active', responded_at = NOW() WHERE id = NEW.id;
  ELSIF NEW.status = 'pending' THEN
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
