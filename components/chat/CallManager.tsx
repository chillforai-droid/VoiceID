import React, { useEffect, useRef, useState } from 'react';
import { useVoiceCall } from '../../hooks/useVoiceCall';
import { PhoneOff, Mic, MicOff, Phone, Video, VideoOff, SwitchCamera, Volume2, Volume1, Minimize2, MessageCircle, Send, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const CONTROLS_HIDE_DELAY = 4000;

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const CallManager = () => {
  const {
    callState, activeCall, callType, acceptCall, endCall,
    remoteAudioRef, localVideoRef, remoteVideoRef,
    isMuted, toggleMute, isCameraOff, toggleCamera, switchCamera,
    callMessages, sendCallMessage,
  } = useVoiceCall();
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const { user } = useAuth();
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const hasNativeAudioRouter = typeof window !== 'undefined' && !!(window as any).AndroidAudioRouter;
  // On the plain website (no native bridge) there was previously no way to
  // move audio off the loudspeaker at all — this is why a connected
  // Bluetooth headset was often ignored and calls stayed on speaker.
  // HTMLMediaElement.setSinkId() lets us pick an output device directly,
  // where the browser supports it (desktop Chrome/Edge reliably; Android
  // Chrome partially; Safari/iOS not at all — there's no web API that can
  // force those to route to Bluetooth, only the native app can).
  const supportsSinkId = typeof window !== 'undefined' && typeof (window as any).HTMLMediaElement !== 'undefined'
    && 'setSinkId' in (window as any).HTMLMediaElement.prototype;
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [audioRouteError, setAudioRouteError] = useState<string | null>(null);

  const toggleSpeaker = async () => {
    const next = !isSpeakerOn;
    setAudioRouteError(null);

    if (hasNativeAudioRouter) {
      setIsSpeakerOn(next);
      (window as any).AndroidAudioRouter?.setSpeakerOn?.(next);
      return;
    }

    if (!supportsSinkId || !remoteAudioRef.current) return;
    try {
      // Ask for device labels (enumerateDevices only returns them after a
      // getUserMedia permission grant, which a call already has by now).
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      let target: MediaDeviceInfo | undefined;
      if (next) {
        // Loudspeaker: prefer a device explicitly labelled as one.
        target = outputs.find(d => /speaker/i.test(d.label));
      } else {
        // Earpiece/headset: prefer Bluetooth or a wired headset over the
        // default output.
        target = outputs.find(d => /bluetooth|headset|hands-?free|earpiece/i.test(d.label));
      }
      await (remoteAudioRef.current as any).setSinkId(target?.deviceId || 'default');
      setIsSpeakerOn(next);
    } catch (err: any) {
      console.error('toggleSpeaker: setSinkId failed', err);
      setAudioRouteError('Couldn\u2019t switch audio output on this browser.');
    }
  };

  const canToggleSpeaker = hasNativeAudioRouter || supportsSinkId;

  useEffect(() => {
    if (!activeCall || !user) { setOtherProfile(null); return; }
    const otherId = activeCall.caller_id === user.id ? activeCall.receiver_id : activeCall.caller_id;
    supabase.from('profiles').select('*').eq('id', otherId).maybeSingle().then(({ data }) => setOtherProfile(data));
  }, [activeCall, user]);

  const isVideo = callType === 'video';
  const isActive = callState === 'connected' || callState === 'connecting';
  const isConnectedVideoCall = isVideo && callState === 'connected' && !isMinimized;

  // Call duration ticks off the DB row's answered_at (set the moment the
  // callee accepts), so both sides show the same elapsed time even if
  // their local clocks drift slightly from each other.
  useEffect(() => {
    if (callState !== 'connected' || !activeCall?.answered_at) { setElapsedSeconds(0); return; }
    const start = new Date(activeCall.answered_at).getTime();
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [callState, activeCall?.answered_at]);

  useEffect(() => {
    if (showChat) chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [callMessages, showChat]);

  useEffect(() => {
    if (callState === 'idle') { setIsMinimized(false); setShowChat(false); }
  }, [callState]);

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

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendCallMessage(chatInput);
    setChatInput('');
  };

  if (callState === 'idle') return null;

  const name = otherProfile?.display_name || otherProfile?.username || 'VoiceID User';
  const isIncoming = callState === 'ringing-incoming';
  const isOutgoing = callState === 'ringing-outgoing';
  const showRemoteVideo = isVideo && (callState === 'connected' || callState === 'connecting');
  const showOverlay = !isConnectedVideoCall || controlsVisible;

  // Minimized floating bubble — lets the caller keep using the rest of
  // the app mid-call, like WhatsApp's picture-in-picture pill. Only
  // available once the call is actually active (nothing useful to show
  // while it's still ringing).
  if (isMinimized && isActive) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        aria-label="Expand call"
        className="fixed bottom-24 right-4 z-[100] w-16 h-16 rounded-full shadow-xl overflow-hidden ring-2 ring-white/70 bg-gray-900 flex items-center justify-center"
      >
        {isVideo && !isCameraOff ? (
          <video ref={remoteVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        ) : otherProfile?.avatar_url ? (
          <img src={otherProfile.avatar_url} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-bold text-lg">{name.charAt(0).toUpperCase()}</span>
        )}
        <span className="absolute bottom-0.5 text-[9px] text-white bg-black/50 px-1 rounded">{formatDuration(elapsedSeconds)}</span>
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      </button>
    );
  }

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

      {isActive && (
        <button
          aria-label="Minimize call"
          onClick={e => { e.stopPropagation(); setIsMinimized(true); }}
          className={`absolute top-6 left-6 z-20 w-10 h-10 rounded-full flex items-center justify-center transition-opacity duration-300 ${isVideo ? 'bg-white/20 text-white backdrop-blur' : 'bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-white'} ${showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <Minimize2 size={18} />
        </button>
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
                : formatDuration(elapsedSeconds)}
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

          {isActive && canToggleSpeaker && (
            <button aria-label={isSpeakerOn ? 'Switch to earpiece' : 'Switch to loudspeaker'} onClick={toggleSpeaker}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition ${isSpeakerOn ? 'bg-white text-gray-900 ring-2 ring-blue-500' : isVideo ? 'bg-white/20 text-white backdrop-blur' : 'bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-white'}`}>
              {isSpeakerOn ? <Volume2 size={26} /> : <Volume1 size={26} />}
            </button>
          )}

          {isActive && (
            <button aria-label="In-call chat" onClick={() => setShowChat(v => !v)}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center transition ${showChat ? 'bg-white text-gray-900 ring-2 ring-blue-500' : isVideo ? 'bg-white/20 text-white backdrop-blur' : 'bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-white'}`}>
              <MessageCircle size={26} />
              {!showChat && callMessages.length > 0 && (
                <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full ring-2 ring-white" />
              )}
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

      {audioRouteError && (
        <p className="mt-3 text-xs text-red-400 relative z-10">{audioRouteError}</p>
      )}

      {showChat && isActive && (
        <div
          onClick={e => e.stopPropagation()}
          className="fixed inset-x-0 bottom-0 z-30 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl flex flex-col max-h-[60vh]"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">Call Chat</span>
            <button onClick={() => setShowChat(false)} aria-label="Close chat" className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[120px]">
            {callMessages.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-6">Is call ke dauraan message bhejein — sirf aap dono ko dikhega.</p>
            ) : (
              callMessages.map(m => (
                <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <span className={`px-3 py-1.5 rounded-2xl text-sm max-w-[75%] break-words ${m.from === 'me' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white rounded-bl-sm'}`}>
                    {m.text}
                  </span>
                </div>
              ))
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="flex items-center gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] border-t border-gray-100 dark:border-slate-800">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
              placeholder="Message likhein..."
              className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-white"
            />
            <button onClick={handleSendChat} disabled={!chatInput.trim()} className="p-2.5 bg-blue-600 text-white rounded-full disabled:opacity-40 shrink-0" aria-label="Send">
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

