import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
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
    canCallUser: (targetUserId: string) => Promise<{canCall: boolean, reason?: string}>;
}

const VoiceCallContext = createContext<VoiceCallContextType>({} as VoiceCallContextType);

export const VoiceCallProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { isUserOnline } = usePresence();
  const [callState, setCallState] = useState('idle');
  const callStateRef = useRef(callState);
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  const [activeCall, setActiveCall] = useState<any>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const signallingChannel = useRef<RealtimeChannel | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const iceServers = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  const cleanupCall = useCallback(() => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    if (signallingChannel.current) {
      supabase.removeChannel(signallingChannel.current);
      signallingChannel.current = null;
    }
    iceCandidateQueue.current = [];
    setCallState('idle');
    setActiveCall(null);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const callsChannel = useRef<RealtimeChannel | null>(null);

  // Listen for incoming calls (Singleton)
  useEffect(() => {
    if (!user) return;
    if (callsChannel.current) return;

    const channelName = `calls:${user.id}`;
    callsChannel.current = supabase.channel(channelName);
    
    callsChannel.current.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${user.id}` }, (payload) => {
        if (payload.new.status === 'ringing') {
          setActiveCall(payload.new);
          setCallState('ringing-incoming');
        }
    });

    callsChannel.current.subscribe();
    
    return () => { 
        if (callsChannel.current) {
            supabase.removeChannel(callsChannel.current);
            callsChannel.current = null;
        }
    };
  }, [user]);

  const canCallUser = useCallback(async (targetUserId: string): Promise<{canCall: boolean, reason?: string}> => {
      if (!user) return { canCall: false, reason: 'User not authenticated' };
      if (targetUserId === user.id) return { canCall: false, reason: 'Cannot call self' };
      
      // Check online status
      if (!isUserOnline(targetUserId)) return { canCall: false, reason: 'User is offline' };
      
      // Check friendship
      const { data: contact } = await supabase.from('contacts')
        .select('id')
        .or(`and(requester_id.eq.${user.id},responder_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},responder_id.eq.${user.id})`)
        .eq('status', 'accepted')
        .maybeSingle();
      
      if (!contact) return { canCall: false, reason: 'Must be friends to call' };
      
      return { canCall: true };
  }, [user, isUserOnline]);

  const initiateCall = async (receiverId: string) => {
    if (!user || callState !== 'idle') return;
    
    const { canCall, reason } = await canCallUser(receiverId);
    if (!canCall) {
        console.error('[CALL] cannot call:', reason);
        alert(reason);
        return;
    }

    console.log('[CALL] caller:', user.id);
    console.log('[CALL] receiver:', receiverId);
    
    const { data: call, error } = await supabase.from('calls').insert({ caller_id: user.id, receiver_id: receiverId, status: 'ringing' }).select().single();
    if (error) { console.error('[CALL] create failed:', error); return; }
    console.log('[CALL] created:', call.id);
    
    setActiveCall(call);
    setCallState('ringing-outgoing');

    const timeout = setTimeout(async () => {
        if (callStateRef.current === 'ringing-outgoing') {
             console.log('[CALL] timeout');
             await supabase.from('calls').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', call.id);
             cleanupCall();
        }
    }, 30000);
    
    signallingChannel.current = supabase.channel(`voice-call:${call.id}`);
    
    signallingChannel.current.on('broadcast', { event: 'receiver-ready' }, async () => {
        clearTimeout(timeout);
        peerConnection.current = new RTCPeerConnection(iceServers);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStream.current = stream;
        stream.getTracks().forEach(track => peerConnection.current?.addTrack(track, stream));
        peerConnection.current.onicecandidate = event => {
            if (event.candidate) signallingChannel.current?.send({ type: 'broadcast', event: 'ice-candidate', payload: event.candidate });
        };
        peerConnection.current.ontrack = event => {
            if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
        };
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        signallingChannel.current!.send({ type: 'broadcast', event: 'offer', payload: offer });
    });
    signallingChannel.current.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(payload));
        for (const candidate of iceCandidateQueue.current) await peerConnection.current?.addIceCandidate(candidate);
        iceCandidateQueue.current = [];
    });
    signallingChannel.current.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
        const candidate = new RTCIceCandidate(payload);
        if (peerConnection.current?.remoteDescription) peerConnection.current.addIceCandidate(candidate);
        else iceCandidateQueue.current.push(candidate);
    });
    
    signallingChannel.current.subscribe();
  };

  const acceptCall = async () => {
      if (!activeCall) return;
      setCallState('connecting');
      signallingChannel.current = supabase.channel(`voice-call:${activeCall.id}`);
      signallingChannel.current.on('broadcast', { event: 'offer' }, async ({ payload }) => {
          peerConnection.current = new RTCPeerConnection(iceServers);
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStream.current = stream;
          stream.getTracks().forEach(track => peerConnection.current?.addTrack(track, stream));
          peerConnection.current.onicecandidate = event => {
              if (event.candidate) signallingChannel.current?.send({ type: 'broadcast', event: 'ice-candidate', payload: event.candidate });
          };
          peerConnection.current.ontrack = event => {
              if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
          };
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(payload));
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          signallingChannel.current!.send({ type: 'broadcast', event: 'answer', payload: answer });
          setCallState('connected');
      });
      signallingChannel.current.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
          const candidate = new RTCIceCandidate(payload);
          if (peerConnection.current?.remoteDescription) peerConnection.current.addIceCandidate(candidate);
          else iceCandidateQueue.current.push(candidate);
      });
      signallingChannel.current.subscribe(() => {
          signallingChannel.current!.send({ type: 'broadcast', event: 'receiver-ready' });
      });
      await supabase.from('calls').update({ status: 'accepted', answered_at: new Date().toISOString() }).eq('id', activeCall.id);
  };

  const endCall = async () => {
    if (activeCall) await supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', activeCall.id);
    cleanupCall();
  };

  return (
    <VoiceCallContext.Provider value={{ callState, activeCall, initiateCall, acceptCall, endCall, cleanupCall, remoteAudioRef, canCallUser }}>
      {children}
    </VoiceCallContext.Provider>
  );
};

export const useVoiceCall = () => useContext(VoiceCallContext);
