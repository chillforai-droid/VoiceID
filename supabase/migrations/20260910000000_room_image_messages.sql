-- Lets a room message carry an image (optionally with a text caption that
-- can include a link), rendered client-side as a single photo+caption card
-- — the same shape as a WhatsApp/Telegram media message. Reuses the
-- existing room_messages row (content = the caption, '' when there isn't
-- one — the column is already NOT NULL, so no schema relaxation needed)
-- instead of a new table, since it's still one message with one
-- sender/timestamp.

ALTER TABLE public.room_messages DROP CONSTRAINT room_messages_content_type_check;
ALTER TABLE public.room_messages ADD CONSTRAINT room_messages_content_type_check
  CHECK (content_type IN ('text', 'emoji', 'image'));

ALTER TABLE public.room_messages
  ADD COLUMN IF NOT EXISTS b2_object_key TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS byte_size BIGINT;
