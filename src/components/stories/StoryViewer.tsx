import { useEffect, useRef, useState } from 'react';
import { X, Send, Eye, Trash2, Pause, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Story, StoryGroup, storyMediaUrl } from '../../hooks/useStories';

const PHOTO_DURATION_MS = 5000;
const TEXT_DURATION_MS = 5000;

interface Props {
  groups: StoryGroup[];
  startIndex: number;
  onClose: () => void;
  markViewed: (storyId: string) => void;
  isViewed: (storyId: string) => boolean;
  getViewers: (storyId: string) => Promise<any[]>;
  deleteStory: (storyId: string) => Promise<void>;
}

export function StoryViewer({ groups, startIndex, onClose, markViewed, isViewed, getViewers, deleteStory }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groupIndex, setGroupIndex] = useState(startIndex);
  const [storyIndex, setStoryIndex] = useState(() => {
    // Resume at the first unviewed story in this group, if any.
    const idx = groups[startIndex]?.stories.findIndex(s => !isViewed(s.id));
    return idx && idx > -1 ? idx : 0;
  });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const group = groups[groupIndex];
  const story: Story | undefined = group?.stories[storyIndex];
  const isOwn = !!user && group?.user.id === user.id;

  const durationForStory = (s: Story): number => {
    if (s.content_type === 'text') return TEXT_DURATION_MS;
    if (s.content_type === 'photo') return PHOTO_DURATION_MS;
    return Math.max(2, s.duration || 5) * 1000; // video/voice
  };

  const goNext = () => {
    if (!group) return;
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex(i => i + 1);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex(i => i + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (storyIndex > 0) {
      setStoryIndex(i => i - 1);
    } else if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1];
      setGroupIndex(i => i - 1);
      setStoryIndex(prevGroup.stories.length - 1);
    }
  };

  // Reset progress + mark viewed whenever the active story changes.
  useEffect(() => {
    setProgress(0);
    setShowViewers(false);
    setReplyText('');
    if (story) markViewed(story.id);
  }, [groupIndex, storyIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress/auto-advance loop. Video and voice stories drive their own
  // progress off actual playback time; photo/text use a fixed timer.
  useEffect(() => {
    if (!story || paused || showViewers) return;
    const isMediaTimed = story.content_type === 'video' || story.content_type === 'voice';
    if (isMediaTimed) return; // handled by the <video>/<audio> timeupdate handlers below

    const total = durationForStory(story);
    startRef.current = performance.now() - progress * total;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const pct = Math.min(1, elapsed / total);
      setProgress(pct);
      if (pct >= 1) {
        goNext();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused, showViewers]);

  useEffect(() => {
    if (paused) {
      videoRef.current?.pause();
      audioRef.current?.pause();
    } else {
      videoRef.current?.play().catch(() => {});
      audioRef.current?.play().catch(() => {});
    }
  }, [paused]);

  const handleTimeUpdate = (el: HTMLMediaElement) => {
    if (!el.duration) return;
    setProgress(el.currentTime / el.duration);
  };

  const openViewers = async () => {
    if (!story) return;
    setPaused(true);
    setShowViewers(true);
    const v = await getViewers(story.id);
    setViewers(v);
  };

  const closeViewers = () => {
    setShowViewers(false);
    setPaused(false);
  };

  const handleDelete = async () => {
    if (!story) return;
    await deleteStory(story.id);
    if (group.stories.length <= 1) {
      onClose();
    } else {
      goNext();
    }
  };

  const sendReply = async () => {
    if (!story || !user || !replyText.trim() || isOwn || sendingReply) return;
    setSendingReply(true);
    try {
      const { data: conversationId, error: rpcError } = await supabase.rpc('create_private_conversation', {
        other_user_id: group.user.id,
      });
      if (rpcError || !conversationId) throw rpcError || new Error('Could not open chat');
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content_type: 'text',
        content_body: `Replied to your story: ${replyText.trim()}`,
      });
      onClose();
      navigate(`/dashboard/chat/${conversationId}`);
    } catch (err) {
      console.error('Failed to send story reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  if (!group || !story) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col select-none">
      {/* Progress bars */}
      <div className="flex gap-1 p-3 pt-safe">
        {group.stories.map((s, i) => (
          <div key={s.id} className="h-1 flex-1 bg-white/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{ width: `${i < storyIndex ? 100 : i === storyIndex ? progress * 100 : 0}%`, transition: i === storyIndex ? 'none' : undefined }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-2 text-white">
        <div className="flex items-center gap-2 min-w-0">
          {group.user.avatar_url ? (
            <img src={group.user.avatar_url} alt="" decoding="async" className="w-8 h-8 rounded-full object-cover" />
          ) : <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">{(group.user.display_name || group.user.username).charAt(0).toUpperCase()}</div>}
          <span className="font-medium truncate">{group.user.display_name || group.user.username}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isOwn && (
            <button onClick={handleDelete} aria-label="Delete story" className="p-2 hover:bg-white/10 rounded-full"><Trash2 size={18} /></button>
          )}
          <button onClick={() => setPaused(p => !p)} aria-label={paused ? 'Play' : 'Pause'} className="p-2 hover:bg-white/10 rounded-full">
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>
      </div>

      {/* Content + tap zones */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <button aria-label="Previous story" onClick={goPrev} className="absolute left-0 top-0 h-full w-1/3 z-10" />
        <button aria-label="Next story" onClick={goNext} className="absolute right-0 top-0 h-full w-1/3 z-10" />

        {story.content_type === 'text' && (
          <div className="w-full h-full flex items-center justify-center p-8" style={{ backgroundColor: story.background_color || '#2563eb' }}>
            <p className="text-white text-3xl font-semibold text-center break-words">{story.text_content}</p>
          </div>
        )}

        {story.content_type === 'photo' && (
          <img src={storyMediaUrl(story.id)} alt="" className="max-h-full max-w-full object-contain" />
        )}

        {story.content_type === 'video' && (
          <video
            ref={videoRef}
            src={storyMediaUrl(story.id)}
            autoPlay
            playsInline
            className="max-h-full max-w-full object-contain"
            onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
            onEnded={goNext}
          />
        )}

        {story.content_type === 'voice' && (
          <div className="flex flex-col items-center gap-6 text-white">
            <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center">
              {group.user.avatar_url ? (
                <img src={group.user.avatar_url} alt="" decoding="async" className="w-full h-full rounded-full object-cover" />
              ) : <span className="text-3xl font-bold">{(group.user.display_name || group.user.username).charAt(0).toUpperCase()}</span>}
            </div>
            <audio
              ref={audioRef}
              src={storyMediaUrl(story.id)}
              autoPlay
              onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget)}
              onEnded={goNext}
            />
            <p className="text-white/70 text-sm">Voice status</p>
          </div>
        )}
      </div>

      {/* Footer: viewers (own story) or reply box (others' story) */}
      <div className="p-3 pb-safe">
        {isOwn ? (
          <button onClick={openViewers} className="flex items-center gap-2 text-white/80 text-sm">
            <Eye size={16} /> Viewers
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              placeholder={`Reply to ${group.user.display_name || group.user.username}…`}
              className="flex-1 bg-white/10 text-white placeholder-white/50 rounded-full px-4 py-3 outline-none"
            />
            <button
              onClick={sendReply}
              disabled={!replyText.trim() || sendingReply}
              aria-label="Send reply"
              className="p-3 rounded-full bg-blue-600 text-white disabled:bg-white/10 disabled:text-white/40"
            >
              <Send size={18} />
            </button>
          </div>
        )}
      </div>

      {showViewers && (
        <div className="absolute inset-x-0 bottom-0 max-h-[60%] bg-neutral-900 rounded-t-3xl p-4 pb-safe overflow-y-auto z-20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">{viewers.length} {viewers.length === 1 ? 'View' : 'Views'}</h3>
            <button onClick={closeViewers} aria-label="Close viewers list" className="p-2 hover:bg-white/10 rounded-full text-white"><X size={18} /></button>
          </div>
          {viewers.length === 0 ? (
            <p className="text-white/50 text-sm">No views yet.</p>
          ) : (
            <div className="space-y-3">
              {viewers.map((v) => (
                <div key={v.viewer_id} className="flex items-center gap-3">
                  {v.profiles?.avatar_url ? (
                    <img src={v.profiles.avatar_url} alt="" decoding="async" className="w-9 h-9 rounded-full object-cover" />
                  ) : <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white text-sm font-bold">{(v.profiles?.display_name || v.profiles?.username || '?').charAt(0).toUpperCase()}</div>}
                  <span className="text-white text-sm">{v.profiles?.display_name || v.profiles?.username}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
