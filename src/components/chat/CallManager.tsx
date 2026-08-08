import React, { useEffect, useState } from 'react';
import { useVoiceCall } from '../../hooks/useVoiceCall';
import { PhoneOff, Mic, MicOff, Phone } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export const CallManager = () => {
  const { callState, activeCall, acceptCall, endCall, remoteAudioRef, isMuted, toggleMute } = useVoiceCall();
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!activeCall || !user) { setOtherProfile(null); return; }
    const otherId = activeCall.caller_id === user.id ? activeCall.receiver_id : activeCall.caller_id;
    supabase.from('profiles').select('*').eq('id', otherId).maybeSingle().then(({ data }) => setOtherProfile(data));
  }, [activeCall, user]);

  if (callState === 'idle') return null;

  const name = otherProfile?.display_name || otherProfile?.username || 'VoiceID User';
  const isIncoming = callState === 'ringing-incoming';
  const isOutgoing = callState === 'ringing-outgoing';
  const isActive = callState === 'connected' || callState === 'connecting';

  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-slate-950 text-gray-900 dark:text-white flex flex-col items-center justify-center p-6 pt-safe pb-safe transition-colors">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div className="w-28 h-28 rounded-full bg-gray-100 dark:bg-slate-800 mb-6 overflow-hidden ring-4 ring-blue-500/20">
        {otherProfile?.avatar_url ? (
          <img src={otherProfile.avatar_url} alt={name} decoding="async" className="w-full h-full object-cover" />
        ) : <div className="w-full h-full flex items-center justify-center text-3xl font-bold">{name.charAt(0).toUpperCase()}</div>}
      </div>
      <h2 className="text-2xl font-bold px-4 max-w-full truncate">{name}</h2>
      <p className="mt-2 text-gray-500 dark:text-slate-400">
        {isIncoming ? 'Incoming voice call' : isOutgoing ? 'Calling…' : callState === 'connecting' ? 'Connecting…' : 'Connected'}
      </p>

      {isIncoming && (
        <div className="mt-10 flex gap-10 items-center">
          <button aria-label="Decline call" onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30">
            <PhoneOff size={28} />
          </button>
          <button aria-label="Accept call" onClick={acceptCall} className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-500/30">
            <Phone size={28} />
          </button>
        </div>
      )}

      {(isOutgoing || isActive) && (
        <div className="mt-10 flex items-center gap-8">
          {isActive && (
            <button aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'} onClick={toggleMute}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition ${isMuted ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white ring-2 ring-blue-500' : 'bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-white'}`}>
              {isMuted ? <MicOff size={26} /> : <Mic size={26} />}
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
