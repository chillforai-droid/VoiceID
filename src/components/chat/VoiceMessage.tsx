import { useState } from 'react';
import { Play, Loader2, Pause } from 'lucide-react';
import { VoiceAudioCache } from '../../lib/VoiceAudioCache';
import { supabase } from '../../lib/supabase';

export function VoiceMessage({ message }: { message: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = async () => {
    if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
        return;
    }

    let blob = await VoiceAudioCache.getAudio(message.id);
    
    if (!blob) {
      setIsDownloading(true);
      const { data, error } = await supabase.storage.from('voice-messages-temp').download(message.storage_path);
      if (error || !data) { setIsDownloading(false); return; }
      blob = data;
      await VoiceAudioCache.saveAudio(message.id, blob);
      setIsDownloading(false);
    }
    
    const audio = new Audio(URL.createObjectURL(blob));
    audioRef.current = audio;
    audio.onended = () => {
        setIsPlaying(false);
    };
    audio.play();
    setIsPlaying(true);
  };

  return (
    <button onClick={playAudio} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 text-gray-900 text-sm font-medium hover:bg-white transition">
      {isDownloading ? <Loader2 className="animate-spin" size={16} /> : isPlaying ? <Pause size={16} /> : <Play size={16} />}
      <span>{message.duration || 0}s</span>
    </button>
  );
}

import { useRef } from 'react';
