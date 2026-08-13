-- Add call_type so a call row can be a voice call or a video call. Existing rows default
-- to 'voice' (no behavior change for the current audio-only flow).
ALTER TABLE public.calls
  ADD COLUMN call_type TEXT CHECK (call_type IN ('voice', 'video')) DEFAULT 'voice' NOT NULL;
