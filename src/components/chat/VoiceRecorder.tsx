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
    const messageId = crypto.randomUUID();
    const filePath = `${id}/${messageId}/voice.webm`;
    
    // 1. Insert metadata
    const { error: dbError } = await supabase.from('messages').insert({
        id: messageId,
        conversation_id: id,
        sender_id: user.id,
        content_type: 'voice',
        storage_path: filePath,
        duration: duration,
        mime_type: audioBlob.type
    });
    
    if (dbError) {
        console.error("VOICE MESSAGE INSERT ERROR", {
          error: dbError,
          payload: {
            id: messageId,
            conversation_id: id,
            sender_id: user.id,
            content_type: 'voice',
            storage_path: filePath,
            duration: duration,
            mime_type: audioBlob.type
          },
          conversationId: id,
          userId: user.id
        });
        setError('Failed to save message.'); 
        return; 
    }

    // 2. Upload
    const { error: uploadError } = await supabase.storage.from('voice-messages-temp').upload(filePath, audioBlob);
    
    if (uploadError) { console.error('Storage error:', uploadError); setError('Failed to upload audio.'); return; }
    
    setAudioBlob(null);
    onSent();
  };

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex items-center gap-2">
        {audioBlob ? (
          <>
            <button onClick={() => setAudioBlob(null)} className="p-3 text-red-500"><X /></button>
            <button onClick={() => new Audio(URL.createObjectURL(audioBlob)).play()} className="p-3 bg-gray-200 rounded-full"><Play /></button>
            <button onClick={sendAudio} className="p-3 bg-blue-600 text-white rounded-full"><Send /></button>
          </>
        ) : isRecording ? (
          <button onClick={stopRecording} className="p-3 bg-red-500 text-white rounded-full"><StopCircle /></button>
        ) : (
          <button onClick={startRecording} className="p-3 bg-gray-200 rounded-full"><Mic /></button>
        )}
      </div>
    </div>
  );
}
