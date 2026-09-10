import { useEffect, useState } from 'react';
import { Loader2, ImageOff } from 'lucide-react';
import { getRoomImageUrl } from '../../lib/roomMediaDownload';
import type { RoomMessage } from '../../hooks/useRoomChat';

export default function RoomImageMessage({ message }: { message: RoomMessage }) {
  const [url, setUrl] = useState<string | null>(message._previewUrl ?? null);
  const [loading, setLoading] = useState(!message._previewUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (message._previewUrl) {
      setUrl(message._previewUrl);
      setLoading(false);
      return;
    }
    if (!message.b2_object_key) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getRoomImageUrl(message.id)
      .then(objectUrl => { if (!cancelled) setUrl(objectUrl); })
      .catch(err => { console.error('RoomImageMessage: failed to load image', err); if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [message.id, message.b2_object_key, message._previewUrl]);

  if (message._failed) {
    return <div className="p-4 text-xs text-red-500">Image nahi bheji ja saki.</div>;
  }
  if (loading) {
    return (
      <div className="w-full aspect-video max-w-xs flex items-center justify-center bg-gray-100 rounded-t-xl text-gray-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (failed || !url) {
    return (
      <div className="w-full aspect-video max-w-xs flex items-center justify-center bg-gray-100 rounded-t-xl text-gray-400 gap-1.5 text-xs">
        <ImageOff size={16} /> Load nahi hui
      </div>
    );
  }

  return <img src={url} alt="" className="w-full max-w-xs max-h-80 object-cover rounded-t-xl" />;
}
