-- Usernames previously had no format validation anywhere except a bare
-- length check (>= 3 chars) on the client. Any other character — slashes,
-- spaces, '?', '#', emoji, unicode that normalizes differently on
-- round-trip through a URL — could end up in a profile's /u/<username>
-- share link and break it: either by splitting the URL into extra path
-- segments (404 from the router) or by the browser/DB doing the lookup on
-- a slightly different string than what's stored (renders "Profile not
-- found"). ChooseVoiceID.tsx now enforces this client-side; this constraint
-- backs it up at the database level for any other client (e.g. the native
-- Android app) that inserts into profiles directly.
--
-- Existing rows are left as-is (NOT VALID) since some may already violate
-- this shape; new inserts/updates must conform going forward. Run this
-- migration's validation step manually once existing bad usernames (if
-- any) have been renamed.
ALTER TABLE public.profiles
  ADD CONSTRAINT username_format_check
  CHECK (username ~ '^[a-z0-9_]{3,25}$') NOT VALID;
