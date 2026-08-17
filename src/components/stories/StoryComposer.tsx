import { useEffect, useRef, useState } from 'react';
import { X, Image as ImageIcon, Video as VideoIcon, Type, Mic, Send, StopCircle, Play, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { uploadStoryMedia } from '../../hooks/useStories';

type Tab = 'photo' | 'video' | 'text' | 'voice';

const BG_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#d97706', '#059669', '#0891b2', '#111827'];

export function StoryComposer({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('photo');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Photo/video
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Text
  const [text, setText] = useState('');
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const audioPreviewUrlRef = useRef<string | null>(null);
  const audioPreviewElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (audioPreviewUrlRef.current) URL.revokeObjectURL(audioPreviewUrlRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [previewUrl]);

  const pickFile = (accept: 'image/*' | 'video/*') => {
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setTab(f.type.startsWith('video/') ? 'video' : 'photo');
  };

  const startRecording = async () => {
    setError(null);

    const nativeRecorder = (window as any).AndroidRecorder;
    if (nativeRecorder) {
      (window as any).__voiceIdDeliverRecording = (base64: string, mimeType: string) => {
        try {
          const byteChars = atob(base64);
          const byteNumbers = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType || 'audio/mp4' });
          setAudioBlob(blob);
          setDuration(Math.max(1, Math.min(Math.round((Date.now() - startTimeRef.current) / 1000), 60)));
        } catch {
          setError('Recording could not be processed.');
        }
        setIsRecording(false);
      };
      (window as any).__voiceIdRecordingError = (message: string) => {
        setError(`Microphone error: ${message}`);
        setIsRecording(false);
      };

      try {
        nativeRecorder.startRecording();
        startTimeRef.current = Date.now();
        setIsRecording(true);
      } catch (err: any) {
        setError(`Microphone error: ${err.message || 'Unknown error'}`);
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setDuration(Math.max(1, Math.min(Math.round((Date.now() - startTimeRef.current) / 1000), 60)));
      };
      recorder.start();
      startTimeRef.current = Date.now();
      setIsRecording(true);
    } catch (err: any) {
      setError(err?.name === 'NotAllowedError' ? 'Microphone permission is blocked.' : 'Could not access microphone.');
    }
  };

  const stopRecording = () => {
    const nativeRecorder = (window as any).AndroidRecorder;
    if (nativeRecorder && isRecording) {
      nativeRecorder.stopRecording();
      return;
    }
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const playAudioPreview = () => {
    if (!audioBlob) return;
    if (!audioPreviewUrlRef.current) audioPreviewUrlRef.current = URL.createObjectURL(audioBlob);
    if (!audioPreviewElRef.current) audioPreviewElRef.current = new Audio(audioPreviewUrlRef.current);
    audioPreviewElRef.current.currentTime = 0;
    audioPreviewElRef.current.play();
  };

  const canPost =
    (tab === 'photo' && !!file) ||
    (tab === 'video' && !!file) ||
    (tab === 'text' && text.trim().length > 0) ||
    (tab === 'voice' && !!audioBlob);

  const post = async () => {
    if (!user || !canPost || posting) return;
    setPosting(true);
    setError(null);
    try {
      if (tab === 'text') {
        const { error: insertError } = await supabase.from('stories').insert({
          user_id: user.id,
          content_type: 'text',
          text_content: text.trim().slice(0, 500),
          background_color: bgColor,
        });
        if (insertError) throw insertError;
      } else if (tab === 'voice') {
        if (!audioBlob) throw new Error('No recording to post.');
        const objectKey = await uploadStoryMedia(audioBlob, audioBlob.type);
        const { error: insertError } = await supabase.from('stories').insert({
          user_id: user.id,
          content_type: 'voice',
          media_object_key: objectKey,
          mime_type: audioBlob.type,
          duration,
        });
        if (insertError) throw insertError;
      } else {
        if (!file) throw new Error('Choose a file first.');
        const objectKey = await uploadStoryMedia(file, file.type || (tab === 'video' ? 'video/mp4' : 'image/jpeg'));
        const { error: insertError } = await supabase.from('stories').insert({
          user_id: user.id,
          content_type: tab,
          media_object_key: objectKey,
          mime_type: file.type,
        });
        if (insertError) throw insertError;
      }
      onPosted();
    } catch (err: any) {
      setError(err?.message || 'Failed to post story. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-white/10 rounded-full"><X size={22} /></button>
        <h2 className="font-semibold">New Story</h2>
        <button
          onClick={post}
          disabled={!canPost || posting}
          aria-label="Post story"
          className="p-2 rounded-full bg-blue-600 disabled:bg-white/10 disabled:text-white/40 text-white"
        >
          {posting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 overflow-hidden">
        {tab === 'photo' && (
          previewUrl ? <img src={previewUrl} alt="Preview" className="max-h-full max-w-full rounded-xl object-contain" />
            : <button onClick={() => pickFile('image/*')} className="flex flex-col items-center gap-3 text-white/70">
                <ImageIcon size={48} /><span>Choose a photo</span>
              </button>
        )}
        {tab === 'video' && (
          previewUrl ? <video src={previewUrl} controls className="max-h-full max-w-full rounded-xl" />
            : <button onClick={() => pickFile('video/*')} className="flex flex-col items-center gap-3 text-white/70">
                <VideoIcon size={48} /><span>Choose a video</span>
              </button>
        )}
        {tab === 'text' && (
          <div className="w-full max-w-sm aspect-[9/16] rounded-2xl flex items-center justify-center p-6 transition-colors" style={{ backgroundColor: bgColor }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 500))}
              placeholder="Type a status…"
              maxLength={500}
              className="w-full bg-transparent text-white text-2xl font-semibold text-center placeholder-white/50 resize-none outline-none"
              rows={5}
            />
          </div>
        )}
        {tab === 'voice' && (
          <div className="flex flex-col items-center gap-6 text-white">
            {audioBlob ? (
              <>
                <button onClick={playAudioPreview} className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center"><Play size={32} /></button>
                <p className="text-white/70 text-sm">{duration}s recorded</p>
                <button onClick={() => { setAudioBlob(null); setDuration(0); }} className="text-white/60 text-sm underline">Record again</button>
              </>
            ) : isRecording ? (
              <button onClick={stopRecording} className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center animate-pulse"><StopCircle size={32} /></button>
            ) : (
              <button onClick={startRecording} className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center"><Mic size={32} /></button>
            )}
            {!audioBlob && <p className="text-white/50 text-sm">{isRecording ? 'Recording… tap to stop' : 'Tap to record a voice status'}</p>}
          </div>
        )}
      </div>

      {tab === 'text' && (
        <div className="flex justify-center gap-2 px-6 pb-2">
          {BG_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setBgColor(c)}
              aria-label={`Background color ${c}`}
              className={`w-7 h-7 rounded-full ${bgColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {error && <p className="text-red-400 text-sm text-center px-6 pb-2">{error}</p>}

      <div className="flex justify-center gap-3 p-4 pb-safe">
        {([
          { key: 'photo', icon: ImageIcon, label: 'Photo' },
          { key: 'video', icon: VideoIcon, label: 'Video' },
          { key: 'text', icon: Type, label: 'Text' },
          { key: 'voice', icon: Mic, label: 'Voice' },
        ] as { key: Tab; icon: any; label: string }[]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl ${tab === key ? 'bg-white/15 text-white' : 'text-white/50'}`}
          >
            <Icon size={20} />
            <span className="text-xs">{label}</span>
          </button>
        ))}
      </div>

      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />
    </div>
  );
          }
