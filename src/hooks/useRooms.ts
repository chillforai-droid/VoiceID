import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface RoomSummary {
  id: string;
  name: string;
  description: string | null;
  room_code: string;
  owner_id: string;
  is_active: boolean;
  is_public: boolean;
  category: string | null;
  room_type: 'normal' | 'creator';
  avatar_url: string | null;
  cover_url: string | null;
  is_featured: boolean;
  created_at: string;
  my_role: 'owner' | 'moderator' | 'member';
  member_count: number;
}

export interface CreatorRoom {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  creator_display_name: string | null;
  owner_name: string;
  member_count: number;
  is_featured: boolean;
  my_status: string | null;
  created_at: string;
}

export interface RoomMemberForManagement {
  member_row_id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'moderator' | 'member';
  status: string;
  is_muted: boolean;
  is_banned: boolean;
  joined_at: string;
}

export interface RoomStats {
  total_members: number;
  new_members_7d: number;
  total_messages: number;
  messages_7d: number;
  room_views: number;
  active_members_7d: number;
}

export interface PublicRoom {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  owner_name: string;
  member_count: number;
  my_status: string | null;
  created_at: string;
}

export const ROOM_CATEGORIES = ['General', 'Music', 'Gaming', 'Study', 'Just Chatting'] as const;
export const CREATOR_ROOM_CATEGORIES = [
  'Technology', 'Gaming', 'Education', 'Entertainment', 'Music', 'News', 'Business', 'Motivation', 'General', 'Other',
] as const;

export interface PendingRequest {
  id: string; // room_members.id
  room_id: string;
  room_name: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Lists rooms the current user is an active member of, plus create/leave
 * actions. Pending-request management for rooms the user owns lives in
 * usePendingRoomRequests below (kept separate so a plain member doesn't
 * pay for that query).
 */
export function useRooms() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    if (!user) { setRooms([]); setLoading(false); return; }
    setLoading(true);

    const { data: memberships, error: memberError } = await supabase
      .from('room_members')
      .select('room_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (memberError || !memberships?.length) {
      if (memberError) console.error('Failed to load room memberships:', memberError);
      setRooms([]);
      setLoading(false);
      return;
    }

    const roomIds = memberships.map(m => m.room_id);
    const roleByRoom = new Map(memberships.map(m => [m.room_id, m.role as 'owner' | 'moderator' | 'member']));

    const [{ data: roomRows, error: roomError }, { data: counts, error: countError }] = await Promise.all([
      supabase.from('rooms').select('*').in('id', roomIds),
      supabase.from('room_members').select('room_id').in('room_id', roomIds).eq('status', 'active'),
    ]);

    if (roomError) console.error('Failed to load rooms:', roomError);
    if (countError) console.error('Failed to load room member counts:', countError);

    const countByRoom = new Map<string, number>();
    for (const row of counts ?? []) {
      countByRoom.set(row.room_id, (countByRoom.get(row.room_id) ?? 0) + 1);
    }

    const combined: RoomSummary[] = (roomRows ?? [])
      .map(r => ({
        ...r,
        my_role: roleByRoom.get(r.id) ?? 'member',
        member_count: countByRoom.get(r.id) ?? 1,
      }))
      .sort((a, b) => (a.name > b.name ? 1 : -1));

    setRooms(combined);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const createRoom = useCallback(async (
    name: string,
    description?: string,
    isPublic = false,
    category?: string,
    creatorOptions?: { roomType?: 'normal' | 'creator'; avatarUrl?: string | null; coverUrl?: string | null; rules?: string; creatorDisplayName?: string },
  ) => {
    if (!user) throw new Error('Not signed in');
    let lastError: any = null;
    // room_code is unique; retry a couple of times on the rare collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          owner_id: user.id,
          name: name.trim(),
          description: description?.trim() || null,
          room_code: generateRoomCode(),
          is_public: isPublic,
          category: category || (isPublic ? 'General' : null),
          room_type: creatorOptions?.roomType || 'normal',
          avatar_url: creatorOptions?.avatarUrl || null,
          cover_url: creatorOptions?.coverUrl || null,
          rules: creatorOptions?.rules?.trim() || null,
          creator_display_name: creatorOptions?.creatorDisplayName?.trim() || null,
        })
        .select()
        .single();
      if (!error) {
        await fetchRooms();
        return data;
      }
      lastError = error;
      if (error.code !== '23505') break; // not a unique-violation, don't retry
    }
    throw lastError;
  }, [user, fetchRooms]);

  const leaveRoom = useCallback(async (roomId: string) => {
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase
      .from('room_members')
      .update({ status: 'left', responded_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', user.id);
    if (error) throw error;
    await fetchRooms();
  }, [user, fetchRooms]);

  // Owner-only room settings — chat lock, video embed, and (new) the full
  // creator-room profile fields. Relies on the existing "Owner can update
  // own room" RLS policy — no new policy needed, since this is one
  // generic partial update against the same table/policy as before.
  const updateRoomSettings = useCallback(async (roomId: string, settings: {
    chat_locked?: boolean; video_embed_url?: string | null;
    name?: string; description?: string | null; category?: string | null;
    is_public?: boolean; rules?: string | null; creator_display_name?: string | null;
    avatar_url?: string | null; cover_url?: string | null;
  }) => {
    const { error } = await supabase.from('rooms').update(settings).eq('id', roomId);
    if (error) throw error;
  }, []);

  const inviteByUserId = useCallback(async (roomId: string, userId: string) => {
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase
      .from('room_members')
      .insert({ room_id: roomId, user_id: userId, role: 'member', status: 'invited', invited_by: user.id });
    if (error) throw error;
  }, [user]);

  const requestToJoin = useCallback(async (roomId: string) => {
    if (!user) throw new Error('Not signed in');
    const { data: inserted, error } = await supabase
      .from('room_members')
      .insert({ room_id: roomId, user_id: user.id, role: 'member', status: 'pending' })
      .select('id')
      .single();
    if (error) throw error;

    // Public rooms get auto-approved by a DB trigger right after insert —
    // RETURNING on the insert won't see that (it runs in an AFTER
    // trigger), so re-read the row to know whether we're actually in now.
    const { data: current } = await supabase
      .from('room_members')
      .select('status')
      .eq('id', inserted.id)
      .single();

    if (current?.status === 'active') {
      await fetchRooms();
      return { joined: true, roomId };
    }
    return { requested: true, roomId };
  }, [user, fetchRooms]);

  const joinByCode = useCallback(async (code: string) => {
    if (!user) throw new Error('Not signed in');
    const { data, error } = await supabase.rpc('find_room_by_code', { p_code: code.trim() });
    if (error) throw error;
    const room = data?.[0];
    if (!room) throw new Error('Room code not found');
    if (room.is_banned) return { banned: true, roomId: room.id, roomName: room.name };
    if (room.my_status === 'active') return { alreadyMember: true, roomId: room.id };
    if (room.my_status === 'pending') return { alreadyRequested: true, roomId: room.id };

    if (room.my_status === 'invited') {
      const { error: acceptError } = await supabase
        .from('room_members')
        .update({ status: 'active', responded_at: new Date().toISOString() })
        .eq('room_id', room.id)
        .eq('user_id', user.id);
      if (acceptError) throw acceptError;
      await fetchRooms();
      return { joined: true, roomId: room.id };
    }

    const result = await requestToJoin(room.id);
    return result.joined
      ? { joined: true, roomId: room.id }
      : { requested: true, roomId: room.id, roomName: room.name };
  }, [user, fetchRooms, requestToJoin]);

  return { rooms, loading, fetchRooms, createRoom, leaveRoom, inviteByUserId, joinByCode, requestToJoin, updateRoomSettings };
}

/** Public rooms for the Explore tab. */
export function usePublicRooms(category?: string) {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPublicRooms = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_public_rooms', { p_category: category || null });
    if (error) {
      console.error('Failed to load public rooms:', error);
      setRooms([]);
      setLoading(false);
      return;
    }
    setRooms(data ?? []);
    setLoading(false);
  }, [category]);

  useEffect(() => { fetchPublicRooms(); }, [fetchPublicRooms]);

  return { rooms, loading, fetchPublicRooms };
}

/** Pending join requests for rooms the current user owns. */
export function usePendingRoomRequests(roomId?: string) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!user) { setRequests([]); setLoading(false); return; }
    setLoading(true);

    // Two owned rooms + explicit joins instead of a PostgREST embed — see
    // fetchProfilesByIds in useStories.ts for why: embeds can fail silently
    // per-role and quietly drop rows instead of surfacing an error.
    const ownedRoomsQuery = roomId
      ? supabase.from('rooms').select('id, name').eq('owner_id', user.id).eq('id', roomId)
      : supabase.from('rooms').select('id, name').eq('owner_id', user.id);
    const { data: ownedRooms, error: roomsError } = await ownedRoomsQuery;

    if (roomsError) console.error('Failed to load owned rooms:', roomsError);
    const roomIds = (ownedRooms ?? []).map(r => r.id);
    if (!roomIds.length) {
      setRequests([]);
      setLoading(false);
      return;
    }
    const nameByRoom = new Map((ownedRooms ?? []).map(r => [r.id, r.name]));

    const { data, error } = await supabase
      .from('room_members')
      .select('id, room_id, user_id, created_at')
      .eq('status', 'pending')
      .in('room_id', roomIds);

    if (error) {
      console.error('Failed to load pending room requests:', error);
      setRequests([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds)
      : { data: [] as any[] };
    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    setRequests((data ?? []).map((r: any) => {
      const p = profileById.get(r.user_id);
      return {
        id: r.id,
        room_id: r.room_id,
        room_name: nameByRoom.get(r.room_id) ?? '',
        user_id: r.user_id,
        username: p?.username ?? 'unknown',
        display_name: p?.display_name ?? null,
        avatar_url: p?.avatar_url ?? null,
        created_at: r.created_at,
      };
    }));
    setLoading(false);
  }, [user, roomId]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const respond = useCallback(async (memberRowId: string, approve: boolean) => {
    const { error } = await supabase
      .from('room_members')
      .update({ status: approve ? 'active' : 'rejected', responded_at: new Date().toISOString() })
      .eq('id', memberRowId);
    if (error) throw error;
    setRequests(prev => prev.filter(r => r.id !== memberRowId));
  }, []);

  return { requests, loading, fetchRequests, respond };
}

/** Creator Rooms discovery (search + category), separate from the plain public-room Explore tab. */
export function useCreatorRooms(category?: string, search?: string) {
  const [rooms, setRooms] = useState<CreatorRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCreatorRooms = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_creator_rooms', {
      p_category: category || null,
      p_search: search?.trim() || null,
    });
    if (error) {
      console.error('Failed to load creator rooms:', error);
      setRooms([]);
      setLoading(false);
      return;
    }
    setRooms(data ?? []);
    setLoading(false);
  }, [category, search]);

  useEffect(() => { fetchCreatorRooms(); }, [fetchCreatorRooms]);

  return { rooms, loading, fetchCreatorRooms };
}

/**
 * Owner/moderator room management: member roster + moderation actions +
 * stats. Every write here is still re-checked server-side (RLS +
 * enforce_room_moderation_permissions trigger) — this hook is a
 * convenience wrapper, not the actual security boundary.
 */
export function useRoomModeration(roomId: string | undefined) {
  const [members, setMembers] = useState<RoomMemberForManagement[]>([]);
  const [stats, setStats] = useState<RoomStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    if (!roomId) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc('list_room_members_for_management', { p_room_id: roomId });
    if (error) {
      console.error('Failed to load room roster for management:', error);
      setMembers([]);
      setLoading(false);
      return;
    }
    setMembers(data ?? []);
    setLoading(false);
  }, [roomId]);

  const fetchStats = useCallback(async () => {
    if (!roomId) { setStats(null); return; }
    const { data, error } = await supabase.rpc('get_room_stats', { p_room_id: roomId });
    if (error) { console.error('Failed to load room stats:', error); return; }
    setStats(data?.[0] ?? null);
  }, [roomId]);

  useEffect(() => { fetchMembers(); fetchStats(); }, [fetchMembers, fetchStats]);

  const setMuted = useCallback(async (memberRowId: string, muted: boolean) => {
    const { error } = await supabase.from('room_members').update({ is_muted: muted }).eq('id', memberRowId);
    if (error) throw error;
    await fetchMembers();
  }, [fetchMembers]);

  const removeMember = useCallback(async (memberRowId: string) => {
    const { error } = await supabase.from('room_members').update({ status: 'left' }).eq('id', memberRowId);
    if (error) throw error;
    await fetchMembers();
  }, [fetchMembers]);

  const banMember = useCallback(async (memberRowId: string) => {
    const { error } = await supabase.from('room_members').update({ status: 'left', is_banned: true }).eq('id', memberRowId);
    if (error) throw error;
    await fetchMembers();
  }, [fetchMembers]);

  const setModerator = useCallback(async (memberRowId: string, isModerator: boolean) => {
    const { error } = await supabase.from('room_members').update({ role: isModerator ? 'moderator' : 'member' }).eq('id', memberRowId);
    if (error) throw error;
    await fetchMembers();
  }, [fetchMembers]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const { error } = await supabase.from('room_messages').delete().eq('id', messageId);
    if (error) throw error;
  }, []);

  return { members, stats, loading, fetchMembers, fetchStats, setMuted, removeMember, banMember, setModerator, deleteMessage };
}

/** Fire-and-forget room analytics event (view/join/leave are logged this way; message_sent is auto-logged server-side). */
export async function logRoomEvent(roomId: string, userId: string | null, eventType: 'room_view' | 'room_join' | 'room_leave') {
  const { error } = await supabase.from('room_events').insert({ room_id: roomId, user_id: userId, event_type: eventType });
  if (error) console.error('Failed to log room event:', error);
}
