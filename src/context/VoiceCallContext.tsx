import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './AuthContext';
import { usePresence } from './PresenceContext';

interface VoiceCallContextType {
  callState: string;
  activeCall: any | null;
  initiateCall: (receiverId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  endCall: () => Promise<void>;
  cleanupCall: () => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
  canCallUser: (targetUserId: string) => Promise<{ canCall: boolean; reason?: string }>;
  isMuted: boolean;
  toggleMute: () => void;
}

const VoiceCallContext = createContext<VoiceCallContextType>({} as VoiceCallContextType);

function buildIceServers() {
  const urls = (import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL || '')
    .split(',')
    .map((v: string) => v.trim())
    .filter(Boolean);
  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  if (urls.length && username && credential) {
    servers.push({ urls, username, credential });
  }
  return { iceServers: servers };
}

export const VoiceCallProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { isUserOnline } = usePresence();
  const [callState, setCallState] = useState('idle');
  const callStateRef = useRef(callState);
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  const [activeCall, setActiveCall] = useState<any>(null);
  const activeCallRef = useRef<any>(null);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const signallingChannel = useRef<RealtimeChannel | null>(null);
  const callsChannel = useRef<RealtimeChannel | null>(null);
  const callRowChannel = useRef<RealtimeChannel | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endingRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);

  const setState = useCallback((state: string) => {
    callStateRef.current = state;
    setCallState(state);
  }, []);

  const clearCallTimer = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const playRemoteAudio = useCallback(async () => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    audio.muted = false;
    audio.volume = 1;
    try { await audio.play(); } catch { /* Browser autoplay may require the call tap to unlock audio. */ }
  }, []);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    if (!remoteAudioRef.current) return;
    remoteAudioRef.current.srcObject = stream;
    void playRemoteAudio();
  }, [playRemoteAudio]);

  const cleanupCall = useCallback(() => {
    clearCallTimer();
    endingRef.current = false;

    const pc = peerConnection.current;
    peerConnection.current = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      try { pc.close(); } catch { /* already closed */ }
    }

    const stream = localStream.current;
    localStream.current = null;
    stream?.getTracks().forEach(track => { try { track.stop(); } catch {} });

    const rowChannel = callRowChannel.current;
    callRowChannel.current = null;
    if (rowChannel) void supabase.removeChannel(rowChannel);

    const channel = signallingChannel.current;
    signallingChannel.current = null;
    if (channel) void supabase.removeChannel(channel);

    iceCandidateQueue.current = [];
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }

    activeCallRef.current = null;
    setActiveCall(null);
    setIsMuted(false);
    setState('idle');
  }, [clearCallTimer, setState]);

  const failCall = useCallback(async (message?: string) => {
    if (endingRef.current) return;
    endingRef.current = true;
    const call = activeCallRef.current;
    if (call && (call.status === 'ringing' || call.status === 'accepted')) {
      await supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', call.id).select('id,status').maybeSingle();
    }
    cleanupCall();
    if (message) alert(message);
  }, [cleanupCall]);

  const toggleMute = useCallback(() => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  }, []);

  const attachPeerHandlers = useCallback((pc: RTCPeerConnection, channel: RealtimeChannel) => {
    pc.onicecandidate = event => {
      if (event.candidate) {
        void channel.send({ type: 'broadcast', event: 'ice-candidate', payload: event.candidate.toJSON() });
      }
    };

    pc.ontrack = event => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      attachRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') setState('connected');
      else if (state === 'failed') void failCall('कॉल कनेक्ट नहीं हो पाई। कृपया नेटवर्क बदलकर फिर कोशिश करें।');
      else if (state === 'closed' && callStateRef.current !== 'idle') cleanupCall();
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        void failCall('कॉल के लिए नेटवर्क कनेक्शन नहीं बन पाया।');
      }
    };
  }, [attachRemoteStream, cleanupCall, failCall, setState]);

  const createLocalPeer = useCallback(async (channel: RealtimeChannel) => {
    const pc = new RTCPeerConnection(buildIceServers());
    peerConnection.current = pc;
    attachPeerHandlers(pc, channel);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStream.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      return pc;
    } catch (error) {
      try { pc.close(); } catch {}
      peerConnection.current = null;
      throw error;
    }
  }, [attachPeerHandlers]);

  const addRemoteIce = useCallback(async (payload: any) => {
    const candidate = new RTCIceCandidate(payload);
    const pc = peerConnection.current;
    if (pc?.remoteDescription) {
      try { await pc.addIceCandidate(candidate); } catch { /* ignore duplicate/late candidates */ }
    } else {
      iceCandidateQueue.current.push(candidate);
    }
  }, []);

  const flushIce = useCallback(async () => {
    const pc = peerConnection.current;
    if (!pc?.remoteDescription) return;
    const queued = iceCandidateQueue.current.splice(0);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch { /* ignore late candidate */ }
    }
  }, []);

  const subscribeCallUpdates = useCallback((callId: string) => {
    if (callRowChannel.current) void supabase.removeChannel(callRowChannel.current);
    const channel = supabase.channel(`call-row:${callId}`);
    callRowChannel.current = channel;
    channel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}`,
    }, payload => {
      const next = payload.new as any;
      activeCallRef.current = next;
      setActiveCall(next);
      if (next.status === 'ended' || next.status === 'rejected' || next.status === 'missed') {
        cleanupCall();
      }
    });
    void channel.subscribe();
    return channel;
  }, [cleanupCall]);

  const canCallUser = useCallback(async (targetUserId: string): Promise<{ canCall: boolean; reason?: string }> => {
    if (!user) return { canCall: false, reason: 'User not authenticated' };
    if (targetUserId === user.id) return { canCall: false, reason: 'Cannot call self' };
    if (!isUserOnline(targetUserId)) return { canCall: false, reason: 'User is offline' };
    const { data: contact } = await supabase.from('contacts').select('id')
      .or(`and(requester_id.eq.${user.id},responder_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},responder_id.eq.${user.id})`)
      .eq('status', 'accepted').maybeSingle();
    if (!contact) return { canCall: false, reason: 'Must be friends to call' };
    return { canCall: true };
  }, [user, isUserOnline]);

  const initiateCall = useCallback(async (receiverId: string) => {
    if (!user || callStateRef.current !== 'idle') return;
    const { canCall, reason } = await canCallUser(receiverId);
    if (!canCall) { alert(reason); return; }

    const { data: call, error } = await supabase.from('calls')
      .insert({ caller_id: user.id, receiver_id: receiverId, status: 'ringing' })
      .select().single();
    if (error || !call) { console.error('[VOICEID_CALL] create failed', error); return; }

    activeCallRef.current = call;
    setActiveCall(call);
    setState('ringing-outgoing');
    subscribeCallUpdates(call.id);

    callTimeoutRef.current = setTimeout(async () => {
      if (callStateRef.current === 'ringing-outgoing') {
        await supabase.from('calls').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', call.id).select('id,status').maybeSingle();
        cleanupCall();
      }
    }, 30000);

    const channel = supabase.channel(`voice-call:${call.id}`);
    signallingChannel.current = channel;

    channel.on('broadcast', { event: 'receiver-ready' }, async () => {
      if (endingRef.current || peerConnection.current) return;
      clearCallTimer();
      setState('connecting');
      try {
        const pc = await createLocalPeer(channel);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await channel.send({ type: 'broadcast', event: 'offer', payload: offer });
      } catch (error) {
        console.error('[VOICEID_CALL] offer failed', error);
        await failCall('माइक्रोफ़ोन या कॉल कनेक्शन शुरू नहीं हो पाया।');
      }
    });

    channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      const pc = peerConnection.current;
      if (!pc || endingRef.current) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        await flushIce();
      } catch (error) {
        console.error('[VOICEID_CALL] answer failed', error);
        await failCall('कॉल कनेक्शन पूरा नहीं हो पाया।');
      }
    });

    channel.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => { void addRemoteIce(payload); });
    void channel.subscribe();
  }, [user, canCallUser, subscribeCallUpdates, cleanupCall, clearCallTimer, setState, createLocalPeer, flushIce, addRemoteIce, failCall]);

  const acceptCall = useCallback(async () => {
    const call = activeCallRef.current;
    if (!call || callStateRef.current !== 'ringing-incoming') return;
    const { data: latest } = await supabase.from('calls').select('*').eq('id', call.id).maybeSingle();
    if (!latest || latest.status !== 'ringing') { cleanupCall(); return; }

    clearCallTimer();
    setState('connecting');
    subscribeCallUpdates(call.id);
    const channel = supabase.channel(`voice-call:${call.id}`);
    signallingChannel.current = channel;

    channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      if (endingRef.current || peerConnection.current) return;
      try {
        const pc = await createLocalPeer(channel);
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        await flushIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await channel.send({ type: 'broadcast', event: 'answer', payload: answer });
      } catch (error) {
        console.error('[VOICEID_CALL] answer creation failed', error);
        await failCall('कॉल कनेक्शन शुरू नहीं हो पाया।');
      }
    });
    channel.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => { void addRemoteIce(payload); });
    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.send({ type: 'broadcast', event: 'receiver-ready' });
        await supabase.from('calls').update({ status: 'accepted', answered_at: new Date().toISOString() }).eq('id', call.id).select('id,status').maybeSingle();
      }
    });
  }, [clearCallTimer, cleanupCall, subscribeCallUpdates, createLocalPeer, flushIce, addRemoteIce, failCall, setState]);

  const endCall = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    const call = activeCallRef.current;
    if (call) {
      const nextStatus = callStateRef.current === 'ringing-incoming' ? 'rejected' : 'ended';
      await supabase.from('calls').update({ status: nextStatus, ended_at: new Date().toISOString() }).eq('id', call.id).select('id,status').maybeSingle();
    }
    cleanupCall();
  }, [cleanupCall]);

  // Incoming calls + remote status changes for the user's active/incoming calls.
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`calls:${user.id}`);
    callsChannel.current = channel;
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${user.id}` }, payload => {
      if (payload.new.status === 'ringing' && callStateRef.current === 'idle') {
        activeCallRef.current = payload.new;
        setActiveCall(payload.new);
        setState('ringing-incoming');
      }
    });
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `receiver_id=eq.${user.id}` }, payload => {
      const current = activeCallRef.current;
      if (!current || payload.new.id !== current.id) return;
      activeCallRef.current = payload.new;
      setActiveCall(payload.new);
      if (['ended', 'rejected', 'missed'].includes(payload.new.status)) cleanupCall();
    });
    void channel.subscribe();
    return () => {
      if (callsChannel.current === channel) callsChannel.current = null;
      void supabase.removeChannel(channel);
    };
  }, [user, setState]);

  useEffect(() => {
    return () => cleanupCall();
  }, [cleanupCall]);

  const value = useMemo(() => ({
    callState, activeCall, initiateCall, acceptCall, endCall, cleanupCall,
    remoteAudioRef, canCallUser, isMuted, toggleMute,
  }), [callState, activeCall, initiateCall, acceptCall, endCall, cleanupCall, canCallUser, isMuted, toggleMute]);

  return <VoiceCallContext.Provider value={value}>{children}</VoiceCallContext.Provider>;
};

export const useVoiceCall = () => useContext(VoiceCallContext);
