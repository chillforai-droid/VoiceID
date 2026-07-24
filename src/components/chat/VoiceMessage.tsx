import { useState, useEffect } from 'react';
import { Play, Loader2, Check } from 'lucide-react';
import { VoiceAudioCache } from '../../lib/VoiceAudioCache';
import { supabase } from '../../lib/supabase';

export function VoiceMessage({ message }: { message: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDelivered, setIsDelivered] = useState(false);

  const playAudio = async () => {
    let blob = await VoiceAudioCache.getAudio(message.id);
    
    if (!blob) {
      setIsDownloading(true);
      const { data, error } = await supabase.storage.from('voice-messages-temp').download(message.storage_path);
      if (error || !data) { setIsDownloading(false); return; }
      blob = data;
      await VoiceAudioCache.saveAudio(message.id, blob);
      // Acknowledge delivery
      await supabase.rpc('acknowledge_voice_delivery', { p_message_id: message.id });
      setIsDelivered(true);
      setIsDownloading(false);
    }
    
    const audio = new Audio(URL.createObjectURL(blob));
    audio.onended = () => {
        setIsPlaying(false);
        supabase.rpc('acknowledge_voice_played', { p_message_id: message.id });
    };
    audio.play();
    setIsPlaying(true);
  };

  return (
    <button onClick={playAudio} className="flex items-center gap-2 p-2 rounded-full bg-white/20">
      {isDownloading ? <Loader2 className="animate-spin" /> : <Play />}
      <span>Voice ({message.duration}s)</span>
    </button>
  );
}
