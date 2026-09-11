import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, UserPlus, Copy, Check, LogOut, Crown, Mic, MicOff, PhoneOff, ImagePlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useRoomChat, type RoomMessage } from '../hooks/useRoomChat';
import { useRooms, usePendingRoomRequests } from '../hooks/useRooms';
import { useRoomVoiceCall } from '../hooks/useRoomVoiceCall';
import { relativeTime } from '../lib/timeFormat';
import { linkify } from '../lib/linkify';
import RoomImageMessage from '../components/room/RoomImageMessage';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];

interface FloatingReaction {
  id: string;
  emoji: string;
  left: number;
}

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { messages, members, loading, sendMessage, sendImageMessage } = useRoomChat(id);
  const { leaveRoom, inviteByUserId } = useRooms();
  const { requests, respond } = usePendingRoomRequests(id);
  const { inVoice, connecting, isMuted, voicePresentIds, remoteStreams, joinVoice, leaveVoice, toggleMute } = useRoomVoiceCall(id);

  const [room, setRoom] = useState<any>(null);
  const [input, setInput] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [copied, setCopied] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenEmojiIds = useRef<Set<string> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('rooms').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) console.error('Failed to load room:', error);
      setRoom(data);
    });
  }, [id]);

  // Text messages render in the chat feed; emoji "messages" are reactions —
  // they still land in room_messages (so history/realtime stays uniform),
  // but in the UI they float up over the stage instead of sitting in the
  // feed, like a live room's reaction stream.
  const textMessages = messages.filter(m => m.content_type !== 'emoji');

  useEffect(() => {
    const emojiMessages = messages.filter(m => m.content_type === 'emoji');
    if (seenEmojiIds.current === null) {
      // First load: mark existing emoji history as seen so it doesn't
      // replay as floating reactions on mount.
      seenEmojiIds.current = new Set(emojiMessages.map(m => m.id));
      return;
    }
    const fresh = emojiMessages.filter(m => !seenEmojiIds.current!.has(m.id));
    if (!fresh.length) return;
    for (const m of fresh) seenEmojiIds.current.add(m.id);
    setFloatingReactions(prev => [
      ...prev,
      ...fresh.map(m => ({ id: m.id, emoji: m.content, left: 10 + Math.random() * 80 })),
    ]);
    fresh.forEach(m => {
      setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== m.id)), 2200);
    });
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [textMessages.length]);

  useEffect(() => {
    // Revoke the staged-image preview URL when the room changes or the page unmounts.
    return () => { if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl); };
  }, [id]);

  const isOwner = room && user && room.owner_id === user.id;
  const activeMembers = members.filter(m => m.status === 'active');

  const handleSend = async () => {
    if (pendingImage) {
      const { file } = pendingImage;
      const caption = input;
      setInput('');
      URL.revokeObjectURL(pendingImage.previewUrl);
      setPendingImage(null);
      try {
        await sendImageMessage(file, caption);
      } catch (err) {
        console.error('Failed to send image:', err);
      }
      return;
    }
    if (!input.trim()) return;
    const value = input;
    setInput('');
    try {
      await sendMessage(value, 'text');
    } catch (err) {
      console.error('Failed to send message:', err);
      setInput(value);
    }
  };

  const handleEmoji = async (emoji: string) => {
    try {
      await sendMessage(emoji, 'emoji');
    } catch (err) {
      console.error('Failed to send emoji:', err);
    }
  };

  const handleImagePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const cancelPendingImage = () => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  };

  const handleLeave = async () => {
    if (!id || !window.confirm('Room chhodna chahte hain?')) return;
    await leaveVoice();
    await leaveRoom(id);
    navigate('/dashboard/rooms');
  };

  const copyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.room_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (!id) return null;

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto bg-white">
      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <audio
          key={peerId}
          autoPlay
          ref={el => { if (el) el.srcObject = stream; }}
        />
      ))}
      <style>{`
        @keyframes floatUpFade {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          15% { transform: translateY(-10px) scale(1.1); opacity: 1; }
          100% { transform: translateY(-90px) scale(1); opacity: 0; }
        }
        .float-reaction { animation: floatUpFade 2.2s ease-out forwards; }
      `}</style>

      {/* Stage: room identity + live avatar row, gradient like a live room rather than a plain chat header */}
      <div className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-700 px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-4 shrink-0 overflow-hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard/rooms')} className="text-white/90 hover:text-white shrink-0" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
              <h1 className="font-semibold text-white truncate">{room?.name || 'Room'}</h1>
              {isOwner && <Crown size={14} className="text-amber-300 shrink-0" />}
            </div>
            <p className="text-xs text-white/70">{activeMembers.length} in room</p>
          </div>
          <button onClick={() => setShowInvite(true)} className="p-2 text-white/90 hover:text-white shrink-0" aria-label="Invite">
            <UserPlus size={20} />
          </button>
          <button
            onClick={() => (inVoice ? leaveVoice() : joinVoice())}
            disabled={connecting}
            className={`p-2 rounded-full shrink-0 ${inVoice ? 'bg-red-500 text-white' : 'text-white/90 hover:text-white'}`}
            aria-label={inVoice ? 'Leave voice' : 'Join voice'}
          >
            {inVoice ? <PhoneOff size={20} /> : <Mic size={20} />}
          </button>
          <button onClick={handleLeave} className="p-2 text-white/90 hover:text-white shrink-0" aria-label="Leave room">
            <LogOut size={20} />
          </button>
        </div>

        {inVoice && (
          <div className="mt-2 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-1.5 w-fit">
            <span className="text-xs text-white/90">🎙️ Voice me ho</span>
            <button onClick={toggleMute} className="p-1 text-white/90 hover:text-white" aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </div>
        )}

        <button
          onClick={() => setShowMembers(true)}
          className="mt-3 flex items-center gap-2 overflow-x-auto w-full"
        >
          {activeMembers.slice(0, 10).map(m => (
            <div key={m.id} className="shrink-0 flex flex-col items-center gap-1 w-14">
              <div className="relative">
                {m.avatar_url ? (
                  <img src={m.avatar_url} className="w-11 h-11 rounded-full object-cover ring-2 ring-white/50" alt={m.username} />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center text-sm font-bold ring-2 ring-white/50">
                    {(m.display_name || m.username).charAt(0).toUpperCase()}
                  </div>
                )}
                {voicePresentIds.includes(m.user_id) && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center ring-2 ring-purple-700">
                    <Mic size={9} className="text-white" />
                  </span>
                )}
              </div>
              <span className="text-[10px] text-white/80 truncate w-full text-center">{m.display_name || m.username}</span>
            </div>
          ))}
          {activeMembers.length > 10 && (
            <div className="shrink-0 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center text-xs font-semibold ring-2 ring-white/40">
              +{activeMembers.length - 10}
            </div>
          )}
        </button>

        {/* Floating emoji reactions rise up over the stage */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 overflow-hidden">
          {floatingReactions.map(r => (
            <span
              key={r.id}
              className="float-reaction absolute bottom-2 text-3xl"
              style={{ left: `${r.left}%` }}
            >
              {r.emoji}
            </span>
          ))}
        </div>
      </div>

      {isOwner && requests.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 space-y-2 shrink-0">
          {requests.map(req => (
            <div key={req.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-800 truncate">
                <strong>{req.display_name || req.username}</strong> join karna chahte hain
              </span>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => respond(req.id, true)} className="px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-medium">Accept</button>
                <button onClick={() => respond(req.id, false)} className="px-2.5 py-1 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium">Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live chat feed — compact game/stream-style rows, not 1:1 message bubbles */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 bg-gray-50">
        {loading ? (
          <div className="text-center text-gray-400 py-10">Loading...</div>
        ) : textMessages.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-sm">
            Abhi koi message nahi. Baat shuru karein — emoji bhi bhej sakte hain, wo upar float hoga!
          </div>
        ) : (
          textMessages.map((msg: RoomMessage) => {
            const mine = msg.sender_id === user?.id;
            const isImage = msg.content_type === 'image';
            return (
              <div key={msg.id} className="flex items-start gap-2 px-1.5 py-1 rounded-lg hover:bg-white/60">
                {msg.sender?.avatar_url ? (
                  <img src={msg.sender.avatar_url} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" alt="" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
                    {(msg.sender?.display_name || msg.sender?.username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5">
                    <span className={`text-sm font-semibold mr-1.5 ${mine ? 'text-blue-600' : 'text-purple-700'}`}>
                      {mine ? 'You' : (msg.sender?.display_name || msg.sender?.username || 'Member')}
                    </span>
                    {!isImage && <span className="text-[10px] text-gray-400">{relativeTime(msg.created_at)}</span>}
                  </div>
                  {isImage ? (
                    <div className="max-w-xs rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
                      <RoomImageMessage message={msg} />
                      {msg.content && (
                        <div className="px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap break-words">
                          {linkify(msg.content)}
                        </div>
                      )}
                      <div className="px-3 pb-1.5 text-[10px] text-gray-400">{relativeTime(msg.created_at)}</div>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-800 break-words">{linkify(msg.content)}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Always-visible reaction strip, like a live stream's quick-react bar */}
      <div className="flex items-center gap-1.5 px-3 pt-2 bg-white border-t border-gray-100 shrink-0">
        {QUICK_EMOJIS.map(e => (
          <button
            key={e}
            onClick={() => handleEmoji(e)}
            className="text-xl p-1.5 rounded-full hover:bg-gray-100 active:scale-90 transition-transform"
          >
            {e}
          </button>
        ))}
      </div>

      <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] bg-white shrink-0">
        {pendingImage && (
          <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 border border-gray-200 rounded-xl">
            <img src={pendingImage.previewUrl} className="w-12 h-12 rounded-lg object-cover shrink-0" alt="" />
            <span className="text-xs text-gray-500 flex-1">Caption likh sakte hain, phir Send dabayein</span>
            <button onClick={cancelPendingImage} className="p-1.5 text-gray-400 hover:text-red-500 shrink-0" aria-label="Cancel image">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input type="file" ref={fileInputRef} onChange={handleImagePicked} accept="image/*" className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 text-gray-500 hover:text-blue-600 shrink-0"
            aria-label="Attach image"
          >
            <ImagePlus size={22} />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            placeholder={pendingImage ? 'Caption (optional)...' : 'Message likhein...'}
            className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-w-0"
          />
          <button
            onClick={handleSend}
            disabled={!pendingImage && !input.trim()}
            className="p-2.5 bg-blue-600 text-white rounded-full disabled:opacity-40 shrink-0"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {showMembers && (
        <Sheet onClose={() => setShowMembers(false)} title="Members">
          <div className="space-y-2">
            {activeMembers.map(m => (
              <div key={m.id} className="flex items-center gap-3">
                {m.avatar_url ? (
                  <img src={m.avatar_url} className="w-9 h-9 rounded-full object-cover" alt={m.username} />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                    {(m.display_name || m.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="flex-1 text-sm text-gray-900">{m.display_name || m.username}</span>
                {m.role === 'owner' && <Crown size={14} className="text-amber-500" />}
              </div>
            ))}
          </div>
          {room && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">Room code</span>
              <button onClick={copyCode} className="flex items-center gap-1.5 text-sm font-mono font-semibold text-blue-600">
                {room.room_code} {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}
        </Sheet>
      )}

      {showInvite && id && (
        <InviteSheet roomId={id} onClose={() => setShowInvite(false)} onInvite={inviteByUserId} />
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function InviteSheet({ roomId, onClose, onInvite }: { roomId: string; onClose: () => void; onInvite: (roomId: string, userId: string) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);
      if (error) console.error('Failed to search profiles:', error);
      setResults(data ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
                      }
