import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export type StoryContentType = 'photo' | 'video' | 'text' | 'voice';

export interface Story {
  id: string;
  user_id: string;
  content_type: StoryContentType;
  media_object_key: string | null;
  mime_type: string | null;
  duration: number | null;
  text_content: string | null;
  background_color: string | null;
  created_at: string;
  expires_at: string;
}

export interface StoryGroup {
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null };
  stories: Story[];
  allViewed: boolean;
}

const VIEWED_STORAGE_KEY = 'voiceid_viewed_story_ids';

function loadViewedIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(VIEWED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveViewedIds(ids: Set<string>) {
  try {
    // Cap growth — keep this a lightweight "have I seen this" cache, not an
    // ever-growing log. Newest 500 is more than enough for a 24h window.
    const arr = Array.from(ids).slice(-500);
    window.localStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // Non-fatal — worst case a story's ring shows as unviewed again.
  }
}

export function useStories() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => loadViewedIds());

  const refresh = useCallback(async () => {
    setLoading(true);

    // Fetch stories WITHOUT an embedded profiles(...) join. PostgREST embeds
    // can silently fail for a given role (permission or relationship-cache
    // issue) — the row still comes back, just with profiles: null — and the
    // old code's `if (!profile) continue;` meant such stories quietly
    // vanished with no error and no console warning at all. Fetching stories
    // and profiles separately and merging in JS avoids that failure mode
    // entirely: a broken join can no longer hide otherwise-valid stories.
    const { data: storyRows, error: storiesError } = await supabase
      .from('stories')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(300);

    if (storiesError) {
      console.error('Failed to load stories:', storiesError);
      setGroups([]);
      setLoading(false);
      return;
    }

    const rows = (storyRows || []) as any[];
    const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));

    const profileById = new Map<string, { id: string; username: string; display_name: string | null; avatar_url: string | null }>();
    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        // Don't blank out the whole list just because the profile lookup
        // failed — log it and fall back to a placeholder below instead.
        console.error('Failed to load story authors:', profilesError);
      } else {
        for (const p of (profileRows || []) as any[]) {
          profileById.set(p.id, p);
        }
      }
    }

    const byUser = new Map<string, StoryGroup>();
    for (const row of rows) {
      // Fall back to a minimal placeholder profile rather than dropping the
      // story outright if a profile row is somehow missing.
      const profile = profileById.get(row.user_id) || {
        id: row.user_id,
        username: 'unknown',
        display_name: null,
        avatar_url: null,
      };
      const existing = byUser.get(profile.id);
      const story: Story = {
        id: row.id,
        user_id: row.user_id,
        content_type: row.content_type,
        media_object_key: row.media_object_key,
        mime_type: row.mime_type,
        duration: row.duration,
        text_content: row.text_content,
        background_color: row.background_color,
        created_at: row.created_at,
        expires_at: row.expires_at,
      };
      if (existing) {
        existing.stories.push(story);
      } else {
        byUser.set(profile.id, {
          user: { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url },
          stories: [story],
          allViewed: false,
        });
      }
    }

    const seen = loadViewedIds();
    const result = Array.from(byUser.values()).map(g => ({
      ...g,
      allViewed: g.stories.every(s => seen.has(s.id)),
    }));

    // Own story first (if any), then unviewed authors, then already-viewed authors.
    result.sort((a, b) => {
      if (user) {
        if (a.user.id === user.id) return -1;
        if (b.user.id === user.id) return 1;
      }
      if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
      return 0;
    });

    setGroups(result);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const markViewed = useCallback(async (storyId: string) => {
    setViewedIds(prev => {
      if (prev.has(storyId)) return prev;
      const next = new Set(prev);
      next.add(storyId);
      saveViewedIds(next);
      return next;
    });
    if (!user) return; // Only signed-in views are recorded server-side (RLS requires auth.uid()).
    try {
      await supabase.from('story_views').insert({ story_id: storyId, viewer_id: user.id });
    } catch {
      // Duplicate view (already recorded) or transient error — not fatal.
    }
  }, [user]);

  const getViewers = useCallback(async (storyId: string) => {
    const { data: viewRows, error } = await supabase
      .from('story_views')
      .select('viewer_id, viewed_at')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false });
    if (error) {
      console.error('Failed to load story viewers:', error);
      return [];
    }
    const rows = viewRows || [];
    const viewerIds = Array.from(new Set(rows.map(r => r.viewer_id).filter(Boolean)));
    const profileById = new Map<string, { username: string; display_name: string | null; avatar_url: string | null }>();
    if (viewerIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', viewerIds);
      if (profilesError) {
        console.error('Failed to load viewer profiles:', profilesError);
      } else {
        for (const p of (profileRows || []) as any[]) {
          profileById.set(p.id, p);
        }
      }
    }
    return rows.map(r => ({
      ...r,
      profiles: profileById.get(r.viewer_id) || null,
    }));
  }, []);

  const deleteStory = useCallback(async (storyId: string) => {
    await supabase.from('stories').delete().eq('id', storyId);
    setGroups(prev => prev
      .map(g => ({ ...g, stories: g.stories.filter(s => s.id !== storyId) }))
      .filter(g => g.stories.length > 0));
  }, []);

  return { groups, loading, refresh, markViewed, isViewed: (id: string) => viewedIds.has(id), getViewers, deleteStory };
}

export async function uploadStoryMedia(file: Blob, mimeType: string): Promise<string> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': mimeType, Authorization: `Bearer ${token}` },
    body: file,
  });
  if (!res.ok) throw new Error('Failed to upload story media');
  const { objectKey } = await res.json();
  if (!objectKey) throw new Error('Upload did not return an object key');
  return objectKey;
}

export function storyMediaUrl(storyId: string): string {
  return `/api/media/story?storyId=${encodeURIComponent(storyId)}`;
}
