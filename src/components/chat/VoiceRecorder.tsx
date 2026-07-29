import { useState, useRef, useEffect } from 'react';
import { Mic, StopCircle, Send, X, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MediaCache } from '../../lib/MediaCache';

export function VoiceRecorder({ onSent, onAudioPreview }: { onSent: () => void, onAudioPreview?: (isPreview: boolean) => void }) {
  const { id } = useParams();
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  // On-screen logger: mirrors console.log/error but also renders inline,
  // since mobile browsers have no accessible devtools console.
  const log = (label: string, data?: any) => {
    const line = data !== undefined ? `${label} ${JSON.stringify(data)}` : label;
    console.log(line);
    setDebugLog(prev => [...prev, line].slice(-30));
  };
  const logErr = (label: string, err: any, extra?: any) => {
    const line = `${label} name=${err?.name} message=${err?.message}${extra ? ' ' + JSON.stringify(extra) : ''}`;
    console.error(line, err);
    setDebugLog(prev => [...prev, line, `stack: ${err?.stack || 'n/a'}`].slice(-30));
  };

  useEffect(() => {
    if (onAudioPreview) {
      onAudioPreview(!!audioBlob);
    }
  }, [audioBlob, onAudioPreview]);

  useEffect(() => {
    return () => {
      stopRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    if (!window.isSecureContext) {
      setError("Microphone recording is unavailable in this insecure context.");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Microphone is not supported in this browser.");
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const actualDuration = Math.round((Date.now() - startTimeRef.current) / 1000);
        setDuration(Math.max(1, Math.min(actualDuration, 120)));
      };
      
      mediaRecorder.start();
      startTimeRef.current = Date.now();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Recording error:', err);
      if (err.name === 'NotAllowedError') {
        setError("Microphone permission is blocked. Please allow microphone access in your browser.");
      } else if (window.self !== window.top) {
        setError("Microphone recording may be unavailable in this iframe. Open in a new tab.");
      } else {
        setError(`Microphone error: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const sendAudio = async () => {
    setDebugLog([]);
    log("sendAudio() called", { hasAudioBlob: !!audioBlob, conversationId: id, userId: user?.id });

    if (!audioBlob) {
      log("sendAudio: aborted - no audioBlob in state");
      setError('No recording to send.');
      return;
    }
    if (!id) {
      log("sendAudio: aborted - no conversation id from route params");
      setError('Cannot send: conversation not loaded.');
      return;
    }
    if (!user) {
      log("sendAudio: aborted - no authenticated user");
      setError('Cannot send: not signed in.');
      return;
    }

    setError(null);

    // 1. Calculate Hash
    let sha256: string;
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (err: any) {
      logErr("sendAudio: [step 0 - hashing] threw", err);
      setError('Failed to process recording.');
      return;
    }

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    // 2. Request Authorization: /api/media/upload-auth
    const uploadAuthUrl = "/api/media/upload-auth";
    let url: string, objectKey: string;
    try {
      log("sendAudio: [fetch 1] requesting", { url: uploadAuthUrl, method: "POST" });
      const authRes = await fetch(uploadAuthUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ mimeType: audioBlob.type }),
      });
      log("sendAudio: [fetch 1] response", { url: uploadAuthUrl, status: authRes.status, ok: authRes.ok });

      if (!authRes.ok) {
        log("sendAudio: [fetch 1] upload-auth failed", { status: authRes.status, body: await authRes.text() });
        setError('Failed to authorize upload.');
        return;
      }

      const json = await authRes.json();
      url = json.url;
      objectKey = json.objectKey;
      log("sendAudio: [fetch 1] parsed body", { hasUrl: !!url, hasObjectKey: !!objectKey });

      if (!url || !objectKey) {
        log("sendAudio: [fetch 1] upload-auth returned incomplete payload", json);
        setError('Failed to authorize upload.');
        return;
      }
    } catch (err: any) {
      logErr("sendAudio: [fetch 1] threw", err, { url: uploadAuthUrl });
      setError(`Failed to send voice message: ${err?.message || 'Unknown error'}`);
      return;
    }

    // 3. Upload directly to B2 (presigned PUT)
    try {
      log("sendAudio: [fetch 2] requesting", { url, method: "PUT" });
      const uploadRes = await fetch(url, {
          method: "PUT",
          body: audioBlob,
          headers: { "Content-Type": audioBlob.type }
      });
      log("sendAudio: [fetch 2] response", { url, status: uploadRes.status, ok: uploadRes.ok });

      if (!uploadRes.ok) {
          log("sendAudio: [fetch 2] B2 upload failed", { status: uploadRes.status });
          setError('Failed to upload audio.');
          return;
      }
    } catch (err: any) {
      logErr("sendAudio: [fetch 2] threw", err, { url });
      setError(`Failed to send voice message: ${err?.message || 'Unknown error'}`);
      return;
    }

    // 4. Insert metadata (Supabase client — not a raw fetch(), but the 3rd network call)
    const messageId = crypto.randomUUID();
    try {
      log("sendAudio: [supabase insert] requesting", { table: "messages", messageId });
      const { error: dbError } = await supabase.from('messages').insert({
          id: messageId,
          conversation_id: id,
          sender_id: user.id,
          content_body: '',
          content_type: 'voice',
          b2_object_key: objectKey,
          sha256: sha256,
          media_status: 'pending',
          duration: duration,
          mime_type: audioBlob.type,
          byte_size: audioBlob.size
      });
      log("sendAudio: [supabase insert] response", { hasError: !!dbError });

      if (dbError) {
          log("VOICE MESSAGE INSERT ERROR", { error: dbError });
          setError('Failed to save message.');
          return;
      }
    } catch (err: any) {
      logErr("sendAudio: [supabase insert] threw", err);
      setError(`Failed to send voice message: ${err?.message || 'Unknown error'}`);
      return;
    }

    try {
      await MediaCache.putMedia({
          messageId: messageId,
          mediaType: 'voice',
          blob: audioBlob,
          mimeType: audioBlob.type,
          byteSize: audioBlob.size,
          createdAt: Date.now(),
          sha256: sha256,
          deliveryStatus: 'pending'
      });
    } catch (err: any) {
      logErr("sendAudio: [MediaCache.putMedia] threw", err);
      // Non-fatal: the message is already saved server-side, so don't block on local cache failure.
    }

    setAudioBlob(null);
    onSent();
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex items-center gap-2">
        {audioBlob ? (
          <>
            <button type="button" onClick={() => setAudioBlob(null)} className="p-3 text-gray-500 hover:bg-gray-100 rounded-full"><X size={20} /></button>
            <button type="button" onClick={() => new Audio(URL.createObjectURL(audioBlob)).play()} className="p-3 bg-gray-100 text-gray-700 rounded-full"><Play size={20} /></button>
            <button
              type="button"
              onClick={() => {
                log("SEND BUTTON CLICKED");
                sendAudio();
              }}
              className="p-3 bg-blue-600 text-white rounded-full"
            >
              <Send size={20} />
            </button>
          </>
        ) : isRecording ? (
          <button type="button" onClick={stopRecording} className="p-3 bg-red-500 text-white rounded-full animate-pulse"><StopCircle size={20} /></button>
        ) : (
          <button type="button" onClick={startRecording} className="p-3 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-full"><Mic size={20} /></button>
        )}
      </div>

      {/* Temporary on-screen debug panel — mobile browsers have no devtools console. */}
      {debugLog.length > 0 && (
        <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-2 text-[10px] leading-snug text-gray-700 font-mono max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
          <div className="flex justify-between items-center mb-1">
            <span className="font-semibold text-gray-500">Debug log</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(debugLog.join('\n'))}
              className="text-blue-600 font-semibold"
            >
              Copy
            </button>
          </div>
          {debugLog.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
    </div>
  );
  }
