import React, { useEffect, useRef, useState } from 'react';
import { useVoiceCall } from '../../hooks/useVoiceCall';
import { PhoneOff, Mic, MicOff, Phone, Video, VideoOff, SwitchCamera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const CONTROLS_HIDE_DELAY = 4000;

export const CallManager = () => {
  const {
    callState, activeCall, callType, acceptCall, endCall,
    remoteAudioRef, localVideoRef, remoteVideoRef,
    isMuted, toggleMute, isCameraOff, toggleCamera, switchCamera,
  } = useVoiceCall();
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const { user } = useAuth();
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeCall || !user) { setOtherProfile(null); return; }
    const otherId = activeCall.caller_id === user.id ? activeCall.receiver_id : activeCall.caller_id;
    supabase.from('profiles').select('*').eq('id', otherId).maybeSingle().then(({ data }) => setOtherProfile(data));
  }, [activeCall, user]);

  const isVideo = callType === 'video';
  const isConnectedVideoCall = isVideo && callState === 'connected';

  // Auto-hide the overlay a few seconds into a connected video call so it doesn't
  // block the view; tapping the screen brings it back.
  useEffect(() => {
    if (!isConnectedVideoCall) {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [isConnectedVideoCall]);

  const handleScreenTap = () => {
    if (!isConnectedVideoCall) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (controlsVisible) {
      setControlsVisible(false);
    } else {
      setControlsVisible(true);
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    }
  };

  if (callState === 'idle') return null;

  const name = otherProfile?.display_name || otherProfile?.username || 'VoiceID User';
  const isIncoming = callState === 'ringing-incoming';
  const isOutgoing = callState === 'ringing-outgoing';
  const isActive = callState === 'connected' || callState === 'connecting';
  const showRemoteVideo = isVideo && (callState === 'connected' || callState === 'connecting');
  const showOverlay = !isConnectedVideoCall || controlsVisible;

  return (
    <div
      onClick={handleScreenTap}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 pt-safe pb-safe transition-colors ${isVideo ? 'bg-black text-white' : 'bg-white dark:bg-slate-950 text-gray-900 dark:text-white'}`}
    >
      <audio ref={remoteAudioRef} autoPlay playsInline className={isVideo ? 'hidden' : ''} />

      {isVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover bg-black ${showRemoteVideo ? '' : 'hidden'}`}
        />
      )}

      {isVideo && (isActive || isOutgoing) && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`absolute top-6 right-6 w-28 h-40 rounded-2xl object-cover ring-2 ring-white/30 shadow-lg z-10 ${isCameraOff ? 'hidden' : ''}`}
        />
      )}

      {/* Avatar shown for voice calls, or for video calls before the remote stream arrives / while camera is off */}
      {(!isVideo || !showRemoteVideo) && (
        <div className="w-28 h-28 rounded-full bg-gray-100 dark:bg-slate-800 mb-6 overflow-hidden ring-4 ring-blue-500/20 relative z-10">
          {otherProfile?.avatar_url ? (
            <img src={otherProfile.avatar_url} alt={name} decoding="async" className="w-full h-full object-cover" />
          ) : <div className="w-full h-full flex items-center justify-center text-3xl font-bold">{name.charAt(0).toUpperCase()}</div>}
        </div>
      )}

      <div className={`flex flex-col items-center transition-opacity duration-300 ${showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <h2 className={`text-2xl font-bold px-4 max-w-full truncate relative z-10 ${isVideo ? 'drop-shadow-lg' : ''}`}>{name}</h2>
        <p className={`mt-2 relative z-10 ${isVideo ? 'text-gray-200 drop-shadow' : 'text-gray-500 dark:text-slate-400'}`}>
          {isIncoming
            ? (isVideo ? 'Incoming video call' : 'Incoming voice call')
            : isOutgoing
              ? 'Calling…'
              : callState === 'connecting'
                ? 'Connecting…'
                : 'Connected'}
        </p>
      </div>

      {isIncoming && (
        <div className="mt-10 flex gap-10 items-center relative z-10">
          <button aria-label="Decline call" onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30">
            <PhoneOff size={28} />
          </button>
          <button aria-label="Accept call" onClick={acceptCall} className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-500/30">
            {isVideo ? <Video size={28} /> : <Phone size={28} />}
          </button>
        </div>
      )}

      {(isOutgoing || isActive) && (
        <div
          onClick={e => e.stopPropagation()}
          className={`mt-10 flex items-center gap-6 relative z-10 flex-wrap justify-center transition-opacity duration-300 ${showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          {isActive && (
            <button aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'} onClick={toggleMute}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition ${isMuted ? 'bg-white text-gray-900 ring-2 ring-blue-500' : isVideo ? 'bg-white/20 text-white backdrop-blur' : 'bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-white'}`}>
              {isMuted ? <MicOff size={26} /> : <Mic size={26} />}
            </button>
          )}

          {isVideo && isActive && (
            <button aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'} onClick={toggleCamera}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition ${isCameraOff ? 'bg-white text-gray-900 ring-2 ring-blue-500' : 'bg-white/20 text-white backdrop-blur'}`}>
              {isCameraOff ? <VideoOff size={26} /> : <Video size={26} />}
            </button>
          )}

          {isVideo && isActive && !isCameraOff && (
            <button aria-label="Switch camera" onClick={switchCamera}
              className="w-16 h-16 rounded-full flex items-center justify-center bg-white/20 text-white backdrop-blur">
              <SwitchCamera size={26} />
            </button>
          )}

          <button aria-label="End call" onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30">
            <PhoneOff size={28} />
          </button>
        </div>
      )}
    </div>
  );
};
