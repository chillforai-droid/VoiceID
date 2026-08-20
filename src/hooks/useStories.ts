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

export interface ProfileSummary {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface StoryGroup {
  user: ProfileSummary;
  stories: Story[];
  allViewed: boolean;
}

export interface StoryViewer {
  viewer_id: string;
  viewed_at: string;
  profiles: ProfileSummary | null;
}

const VIEWED_STORAGE_KEY = 'voiceid_viewed_story_ids';

const UNKNOWN_PROFILE = (id: string): ProfileSummary => ({
  id,
  username: 'unknown',
  display_name: null,
  avatar_url: null,
});

/**
 * Fetches profiles for a set of user ids as a plain query (no PostgREST
 * embed), returning a Map keyed by id for O(1) lookup during merge.
 *
 * Intentionally avoids `.select('*, profiles(...)')`-style embeds: those
 * joins can fail silently for a given role (permission or relationship-
 * cache issue) — the parent row still comes back, just with the embedded
 * field as `null` — which previously caused otherwise-valid stories to
 * vanish from the UI with no visible error. Querying `profiles` directly
 * surfaces failures explicitly via `error` and keeps story data reachable
 * even when the profile lookup fails.
 */
async function fetchProfilesByIds(ids: string[], context: string): Promise<Map<string, ProfileSummary>> {
  const byId = new Map<string, ProfileSummary>();
  if (ids.length === 0) return byId;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids);

  if (error) {
    console.error(`Failed to load profiles (${context}):`, error);
    return byId;
  }

  for (const profile of (data ?? []) as ProfileSummary[]) {
    byId.set(profile.id, profile);
  }
  return byId;
}

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

    const rows: Story[] = storyRows ?? [];
    const userIds = Array.from(new Set(rows.map(row => row.user_id).filter(Boolean)));
    const profileById = await fetchProfilesByIds(userIds, 'story authors');

    const byUser = new Map<string, StoryGroup>();
    for (const row of rows) {
      // Fall back to a placeholder rather than dropping the story outright
      // if its author's profile is missing or failed to load.
      const profile = profileById.get(row.user_id) ?? UNKNOWN_PROFILE(row.user_id);
      const group = byUser.get(profile.id);
      if (group) {
        group.stories.push(row);
      } else {
        byUser.set(profile.id, {
          user: profile,
          stories: [row],
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

  const getViewers = useCallback(async (storyId: string): Promise<StoryViewer[]> => {
    const { data: viewRows, error } = await supabase
      .from('story_views')
      .select('viewer_id, viewed_at')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false });

    if (error) {
      console.error('Failed to load story viewers:', error);
      return [];
    }

    const rows = viewRows ?? [];
    const viewerIds = Array.from(new Set(rows.map(row => row.viewer_id).filter(Boolean)));
    const profileById = await fetchProfilesByIds(viewerIds, 'story viewers');

    return rows.map(row => ({
      viewer_id: row.viewer_id,
      viewed_at: row.viewed_at,
      profiles: profileById.get(row.viewer_id) ?? null,
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
