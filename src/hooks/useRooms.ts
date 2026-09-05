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
  created_at: string;
  my_role: 'owner' | 'member';
  member_count: number;
}

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
    const roleByRoom = new Map(memberships.map(m => [m.room_id, m.role as 'owner' | 'member']));

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

  const createRoom = useCallback(async (name: string, description?: string) => {
    if (!user) throw new Error('Not signed in');
    let lastError: any = null;
    // room_code is unique; retry a couple of times on the rare collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from('rooms')
        .insert({ owner_id: user.id, name: name.trim(), description: description?.trim() || null, room_code: generateRoomCode() })
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

  const inviteByUserId = useCallback(async (roomId: string, userId: string) => {
    if (!user) throw new Error('Not signed in');
    const { error } = await supabase
      .from('room_members')
      .insert({ room_id: roomId, user_id: userId, role: 'member', status: 'invited', invited_by: user.id });
    if (error) throw error;
  }, [user]);

  const joinByCode = useCallback(async (code: string) => {
    if (!user) throw new Error('Not signed in');
    const { data, error } = await supabase.rpc('find_room_by_code', { p_code: code.trim() });
    if (error) throw error;
    const room = data?.[0];
    if (!room) throw new Error('Room code not found');
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

    const { error: reqError } = await supabase
      .from('room_members')
      .insert({ room_id: room.id, user_id: user.id, role: 'member', status: 'pending' });
    if (reqError) throw reqError;
    return { requested: true, roomId: room.id, roomName: room.name };
  }, [user, fetchRooms]);

  return { rooms, loading, fetchRooms, createRoom, leaveRoom, inviteByUserId, joinByCode };
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
