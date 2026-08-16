-- Stories / Status feature: short-lived public posts (photo, video, text, voice)
-- shown on a user's profile / a stories rail, similar to WhatsApp/Instagram status.

CREATE TABLE public.stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN ('photo', 'video', 'text', 'voice')),
    media_object_key TEXT,      -- B2 object key for photo/video/voice stories
    mime_type TEXT,
    duration INTEGER,           -- seconds, for video/voice stories
    text_content TEXT,          -- caption (all types) or the status message itself for text stories
    background_color TEXT,      -- hex background for text stories, e.g. #2563eb
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    CONSTRAINT valid_story_content CHECK (
        (content_type = 'text' AND text_content IS NOT NULL)
        OR (content_type IN ('photo', 'video', 'voice') AND media_object_key IS NOT NULL)
    )
);

CREATE INDEX stories_active_idx ON public.stories (expires_at, created_at DESC);
CREATE INDEX stories_user_idx ON public.stories (user_id, created_at DESC);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- Stories are public: anyone (including signed-out visitors browsing a profile)
-- can see a still-active story. Expired rows simply stop matching this policy.
CREATE POLICY "Active stories are publicly viewable" ON public.stories
    FOR SELECT USING (expires_at > now());

CREATE POLICY "Users can create own stories" ON public.stories
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories" ON public.stories
    FOR DELETE USING (auth.uid() = user_id);


CREATE TABLE public.story_views (
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (story_id, viewer_id)
);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Only the story's own author can see the full viewers list; a viewer can also
-- see their own view record (so their client can render "seen" locally).
CREATE POLICY "Owner sees all viewers, viewer sees own view" ON public.story_views
    FOR SELECT USING (
        viewer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_views.story_id AND s.user_id = auth.uid())
    );

CREATE POLICY "Signed-in users can record their own story view" ON public.story_views
    FOR INSERT WITH CHECK (auth.uid() = viewer_id);
