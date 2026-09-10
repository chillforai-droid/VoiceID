import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { uploadMediaWithRetry } from '../lib/uploadMediaWithRetry';

export interface RoomMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content_type: 'text' | 'emoji' | 'image';
  content: string;
  created_at: string;
  b2_object_key?: string | null;
  mime_type?: string | null;
  byte_size?: number | null;
  sender?: { username: string; display_name: string | null; avatar_url: string | null };
  // Client-only: set while an image the current user just picked is still
  // uploading, so their own bubble can render instantly (see sendImageMessage).
  _previewUrl?: string;
  _uploading?: boolean;
  _failed?: boolean;
}

export interface RoomMemberRow {
  id: string;
  user_id: string;
  role: 'owner' | 'member';
  status: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** Realtime chat + live roster for a single room. */
export function useRoomChat(roomId: string | undefined) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [members, setMembers] = useState<RoomMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<any>(null);

  const loadRoster = useCallback(async (id: string) => {
    const { data: memberRows, error } = await supabase
      .from('room_members')
      .select('id, user_id, role, status')
      .eq('room_id', id)
      .in('status', ['active', 'invited']);
    if (error) { console.error('Failed to load room roster:', error); return; }

    const userIds = (memberRows ?? []).map(m => m.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds)
      : { data: [] as any[] };
    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    setMembers((memberRows ?? []).map(m => {
      const p = profileById.get(m.user_id);
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        status: m.status,
        username: p?.username ?? 'unknown',
        display_name: p?.display_name ?? null,
        avatar_url: p?.avatar_url ?? null,
      };
    }));
  }, []);

  useEffect(() => {
    if (!roomId || !user) { setMessages([]); setMembers([]); setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data: rows, error } = await supabase
        .from('room_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) console.error('Failed to load room messages:', error);

      const senderIds = [...new Set((rows ?? []).map(r => r.sender_id))];
      const { data: profiles } = senderIds.length
        ? await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', senderIds)
        : { data: [] as any[] };
      const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      if (!cancelled) {
        setMessages((rows ?? []).map(r => ({ ...r, sender: profileById.get(r.sender_id) })));
        setLoading(false);
      }
      await loadRoster(roomId);
    };

    load();

    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` }, async (payload) => {
        const msg = payload.new as RoomMessage;
        const { data: profile } = await supabase.from('profiles').select('username, display_name, avatar_url').eq('id', msg.sender_id).single();
        setMessages(prev => (prev.find(m => m.id === msg.id) ? prev : [...prev, { ...msg, sender: profile ?? undefined }]));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, () => {
        void loadRoster(roomId);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId, user, loadRoster]);

  const sendMessage = useCallback(async (content: string, contentType: 'text' | 'emoji' = 'text') => {
    if (!roomId || !user || !content.trim()) return;
    const { error } = await supabase
      .from('room_messages')
      .insert({ room_id: roomId, sender_id: user.id, content_type: contentType, content: content.trim() });
    if (error) throw error;
  }, [roomId, user]);

  const sendImageMessage = useCallback(async (file: File, caption: string) => {
    if (!roomId || !user) return;
    const messageId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);

    // Optimistic bubble: shows immediately with the exact file the sender
    // picked, instead of waiting on the upload + realtime round-trip.
    const localMessage: RoomMessage = {
      id: messageId,
      room_id: roomId,
      sender_id: user.id,
      content_type: 'image',
      content: caption.trim(),
      created_at: new Date().toISOString(),
      mime_type: file.type,
      byte_size: file.size,
      sender: undefined,
      _previewUrl: previewUrl,
      _uploading: true,
    };
    setMessages(prev => [...prev, localMessage]);

    try {
      const objectKey = await uploadMediaWithRetry(file, file.type);
      const { error } = await supabase.from('room_messages').insert({
        id: messageId,
        room_id: roomId,
        sender_id: user.id,
        content_type: 'image',
        content: caption.trim(),
        b2_object_key: objectKey,
        mime_type: file.type,
        byte_size: file.size,
      });
      if (error) throw error;
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, b2_object_key: objectKey, _uploading: false } : m));
    } catch (err) {
      console.error('Failed to send room image:', err);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, _uploading: false, _failed: true } : m));
    }
  }, [roomId, user]);

  return { messages, members, loading, sendMessage, sendImageMessage };
}
