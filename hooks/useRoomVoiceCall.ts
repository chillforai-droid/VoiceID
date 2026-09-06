import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { buildIceServers } from '../context/VoiceCallContext';

/**
 * Group voice for a room.
 *
 * Mesh topology: every participant holds one RTCPeerConnection per other
 * participant, signaled over a single `room-voice:{roomId}` channel that
 * combines Supabase Presence (who's currently in the call) with broadcast
 * messages (offer/answer/ice, each addressed with a `to` field so peers
 * ignore signaling meant for someone else).
 *
 * Glare avoidance: only an *existing* participant initiates an offer to a
 * *newly joined* one (on the presence 'join' event). A newcomer never
 * initiates — it just waits for offers from whoever was already in the
 * room and answers them. This needs no extra negotiation round-trip and
 * works because presence join/leave is authoritative on both sides.
 *
 * This is fine for a small voice room (mesh cost grows O(n^2)); it is not
 * meant to scale to large rooms — that would need an SFU, which is out of
 * scope here.
 */
export function useRoomVoiceCall(roomId: string | undefined) {
  const { user } = useAuth();
  const [inVoice, setInVoice] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voicePresentIds, setVoicePresentIds] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceQueueRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const inVoiceRef = useRef(false);
  useEffect(() => { inVoiceRef.current = inVoice; }, [inVoice]);

  const removePeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try { pc.close(); } catch { /* already closed */ }
      peersRef.current.delete(peerId);
    }
    iceQueueRef.current.delete(peerId);
    setRemoteStreams(prev => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const flushIceFor = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queued = iceQueueRef.current.get(peerId);
    if (!queued?.length) return;
    iceQueueRef.current.set(peerId, []);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch { /* ignore late candidate */ }
    }
  }, []);

  const makePeerConnection = useCallback((peerId: string) => {
    const channel = channelRef.current;
    const pc = new RTCPeerConnection(buildIceServers());
    peersRef.current.set(peerId, pc);

    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    pc.onicecandidate = event => {
      if (event.candidate && channel) {
        void channel.send({
          type: 'broadcast', event: 'voice-ice',
          payload: { to: peerId, from: user!.id, candidate: event.candidate.toJSON() },
        });
      }
    };
    pc.ontrack = event => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStreams(prev => ({ ...prev, [peerId]: stream }));
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) removePeer(peerId);
    };
    return pc;
  }, [user, removePeer]);

  const connectToPeer = useCallback(async (peerId: string) => {
    const channel = channelRef.current;
    if (!channel || peersRef.current.has(peerId)) return;
    try {
      const pc = makePeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await channel.send({ type: 'broadcast', event: 'voice-offer', payload: { to: peerId, from: user!.id, sdp: offer } });
    } catch (err) {
      console.error('Failed to connect to room voice peer:', err);
    }
  }, [makePeerConnection, user]);

  const setupChannel = useCallback(() => {
    if (!roomId || !user || channelRef.current) return channelRef.current;

    const channel = supabase.channel(`room-voice:${roomId}`, { config: { presence: { key: user.id } } });

    channel.on('presence', { event: 'sync' }, () => {
      setVoicePresentIds(Object.keys(channel.presenceState()));
    });
    channel.on('presence', { event: 'join' }, ({ key }) => {
      if (key === user.id) return;
      // Only an already-connected participant reaches out to the newcomer —
      // see the module comment for why this avoids offer/offer glare.
      if (inVoiceRef.current) void connectToPeer(key);
    });
    channel.on('presence', { event: 'leave' }, ({ key }) => {
      removePeer(key);
    });

    channel.on('broadcast', { event: 'voice-offer' }, async ({ payload }) => {
      if (payload.to !== user.id || !inVoiceRef.current) return;
      try {
        let pc = peersRef.current.get(payload.from);
        if (!pc) pc = makePeerConnection(payload.from);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await flushIceFor(payload.from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await channel.send({ type: 'broadcast', event: 'voice-answer', payload: { to: payload.from, from: user.id, sdp: answer } });
      } catch (err) {
        console.error('Failed to answer room voice offer:', err);
      }
    });

    channel.on('broadcast', { event: 'voice-answer' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const pc = peersRef.current.get(payload.from);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await flushIceFor(payload.from, pc);
      } catch (err) {
        console.error('Failed to apply room voice answer:', err);
      }
    });

    channel.on('broadcast', { event: 'voice-ice' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const pc = peersRef.current.get(payload.from);
      const candidate = new RTCIceCandidate(payload.candidate);
      if (pc?.remoteDescription) {
        try { await pc.addIceCandidate(candidate); } catch { /* ignore duplicate/late candidate */ }
      } else {
        const queue = iceQueueRef.current.get(payload.from) ?? [];
        queue.push(candidate);
        iceQueueRef.current.set(payload.from, queue);
      }
    });

    channel.subscribe();
    channelRef.current = channel;
    return channel;
  }, [roomId, user, connectToPeer, makePeerConnection, flushIceFor, removePeer]);

  // Keep a read-only presence subscription alive whenever the room is open
  // so the UI can show who's currently in voice, even before this user
  // joins it themselves.
  useEffect(() => {
    setupChannel();
    return () => {
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
      peersRef.current.forEach(pc => { try { pc.close(); } catch { /* noop */ } });
      peersRef.current.clear();
      iceQueueRef.current.clear();
      localStreamRef.current?.getTracks().forEach(track => { try { track.stop(); } catch { /* noop */ } });
      localStreamRef.current = null;
      setRemoteStreams({});
      setVoicePresentIds([]);
      setInVoice(false);
    };
  }, [setupChannel]);

  const joinVoice = useCallback(async () => {
    if (!user || inVoiceRef.current) return;
    const channel = setupChannel();
    if (!channel) return;
    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      setInVoice(true);
      inVoiceRef.current = true;
      await channel.track({ user_id: user.id, joined_at: new Date().toISOString() });
      // Newcomer never initiates (see module comment) — existing
      // participants will offer to us once they see our presence join.
    } catch (err) {
      console.error('Failed to join room voice:', err);
      alert('माइक्रोफ़ोन एक्सेस नहीं मिल पाया।');
    } finally {
      setConnecting(false);
    }
  }, [user, setupChannel]);

  const leaveVoice = useCallback(async () => {
    if (!inVoiceRef.current) return;
    const channel = channelRef.current;
    peersRef.current.forEach((pc, peerId) => { void peerId; try { pc.close(); } catch { /* noop */ } });
    peersRef.current.clear();
    iceQueueRef.current.clear();
    localStreamRef.current?.getTracks().forEach(track => { try { track.stop(); } catch { /* noop */ } });
    localStreamRef.current = null;
    setRemoteStreams({});
    setIsMuted(false);
    setInVoice(false);
    inVoiceRef.current = false;
    if (channel) await channel.untrack();
  }, []);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  }, []);

  return { inVoice, connecting, isMuted, voicePresentIds, remoteStreams, joinVoice, leaveVoice, toggleMute };
}
