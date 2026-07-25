import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

export const useVoiceCall = () => {
  const { user } = useAuth();
  const [callState, setCallState] = useState('idle'); // idle, ringing-outgoing, ringing-incoming, connecting, connected, ended
  const [activeCall, setActiveCall] = useState<any>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
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

  // Listen for incoming calls
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('incoming-calls')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${user.id}` }, (payload) => {
        if (payload.new.status === 'ringing') {
          setActiveCall(payload.new);
          setCallState('ringing-incoming');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const initiateCall = async (receiverId: string) => {
    if (!user) return;
    const { data: call, error } = await supabase.from('calls').insert({ caller_id: user.id, receiver_id: receiverId, status: 'ringing' }).select().single();
    if (error) { console.error('Failed to create call', error); return; }
    setActiveCall(call);
    setCallState('ringing-outgoing');
    
    // Signaling setup: Create channel
    signallingChannel.current = supabase.channel(`voice-call:${call.id}`);
    signallingChannel.current.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(payload));
        // Flush ICE
        for (const candidate of iceCandidateQueue.current) await peerConnection.current?.addIceCandidate(candidate);
        iceCandidateQueue.current = [];
    });
    signallingChannel.current.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
        const candidate = new RTCIceCandidate(payload);
        if (peerConnection.current?.remoteDescription) peerConnection.current.addIceCandidate(candidate);
        else iceCandidateQueue.current.push(candidate);
    });
    signallingChannel.current.subscribe();

    // Create RTCPeerConnection and offer
    peerConnection.current = new RTCPeerConnection(iceServers);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.current = stream;
    stream.getTracks().forEach(track => peerConnection.current?.addTrack(track, stream));

    peerConnection.current.onicecandidate = event => {
        if (event.candidate) signallingChannel.current?.send({ type: 'broadcast', event: 'ice-candidate', payload: event.candidate });
    };

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    signallingChannel.current.send({ type: 'broadcast', event: 'offer', payload: offer });
  };

  const acceptCall = async () => {
      // Logic for B to accept, answer, etc.
      setCallState('connected');
  };

  const endCall = async () => {
    if (activeCall) await supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', activeCall.id);
    cleanupCall();
  };

  return { callState, activeCall, initiateCall, acceptCall, endCall, cleanupCall, remoteAudioRef };
};
