import { useState, useRef, useEffect } from 'react';
import { Mic, StopCircle, Send, X, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function VoiceRecorder({ onSent, onAudioPreview }: { onSent: () => void, onAudioPreview?: (isPreview: boolean) => void }) {
  const { id } = useParams();
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

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
    if (!audioBlob || !id || !user) return;
    
    // 1. Calculate Hash
    const arrayBuffer = await audioBlob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 2. Request Authorization
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    
    const authRes = await fetch("/api/media/upload-auth", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ mimeType: audioBlob.type }),
    });
    
    const { url, objectKey } = await authRes.json();
    
    // 3. Upload directly to B2
    const uploadRes = await fetch(url, {
        method: "PUT",
        body: audioBlob,
        headers: { "Content-Type": audioBlob.type }
    });
    
    if (!uploadRes.ok) {
        setError('Failed to upload audio.');
        return;
    }
    
    // 4. Insert metadata
    const messageId = crypto.randomUUID();
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
    
    if (dbError) {
        console.error("VOICE MESSAGE INSERT ERROR", { error: dbError });
        setError('Failed to save message.'); 
        return; 
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
            <button onClick={() => setAudioBlob(null)} className="p-3 text-gray-500 hover:bg-gray-100 rounded-full"><X size={20} /></button>
            <button onClick={() => new Audio(URL.createObjectURL(audioBlob)).play()} className="p-3 bg-gray-100 text-gray-700 rounded-full"><Play size={20} /></button>
            <button onClick={sendAudio} className="p-3 bg-blue-600 text-white rounded-full"><Send size={20} /></button>
          </>
        ) : isRecording ? (
          <button onClick={stopRecording} className="p-3 bg-red-500 text-white rounded-full animate-pulse"><StopCircle size={20} /></button>
        ) : (
          <button onClick={startRecording} className="p-3 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-full"><Mic size={20} /></button>
        )}
      </div>
    </div>
  );
}
