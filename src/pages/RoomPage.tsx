import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Smile, UserPlus, Copy, Check, LogOut, Crown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useRoomChat } from '../hooks/useRoomChat';
import { useRooms, usePendingRoomRequests } from '../hooks/useRooms';
import { relativeTime } from '../lib/timeFormat';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { messages, members, loading, sendMessage } = useRoomChat(id);
  const { leaveRoom, inviteByUserId } = useRooms();
  const { requests, respond } = usePendingRoomRequests(id);

  const [room, setRoom] = useState<any>(null);
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('rooms').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) console.error('Failed to load room:', error);
      setRoom(data);
    });
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const isOwner = room && user && room.owner_id === user.id;
  const activeMembers = members.filter(m => m.status === 'active');

  const handleSend = async () => {
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
    setShowEmoji(false);
    try {
      await sendMessage(emoji, 'emoji');
    } catch (err) {
      console.error('Failed to send emoji:', err);
    }
  };

  const handleLeave = async () => {
    if (!id || !window.confirm('Room chhodna chahte hain?')) return;
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
    <div className="flex flex-col h-[calc(100vh-4rem)] sm:h-screen max-w-2xl mx-auto">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white">
        <button onClick={() => navigate('/dashboard/rooms')} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="font-semibold text-gray-900 truncate">{room?.name || 'Room'}</h1>
            {isOwner && <Crown size={14} className="text-amber-500 shrink-0" />}
          </div>
          <button onClick={() => setShowMembers(true)} className="text-xs text-gray-500 hover:text-blue-600">
            {activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''}
          </button>
        </div>
        <button onClick={() => setShowInvite(true)} className="p-2 text-gray-500 hover:text-blue-600" aria-label="Invite">
          <UserPlus size={20} />
        </button>
        <button onClick={handleLeave} className="p-2 text-gray-500 hover:text-red-600" aria-label="Leave room">
          <LogOut size={20} />
        </button>
      </div>

      {isOwner && requests.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 space-y-2">
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

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center text-gray-400 py-10">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-sm">Abhi koi message nahi. Baat shuru karein!</div>
        ) : (
          messages.map(msg => {
            const mine = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!mine && (
                    <span className="text-xs text-gray-400 mb-0.5 px-1">
                      {msg.sender?.display_name || msg.sender?.username || 'Member'}
                    </span>
                  )}
                  <div
                    className={
                      msg.content_type === 'emoji'
                        ? 'text-3xl leading-none px-1'
                        : `px-4 py-2 rounded-2xl text-sm ${mine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'}`
                    }
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-gray-400 mt-0.5 px-1">{relativeTime(msg.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-gray-100 bg-white relative">
        {showEmoji && (
          <div className="absolute bottom-full left-3 mb-2 bg-white border border-gray-200 rounded-2xl shadow-lg p-2 flex gap-1">
            {QUICK_EMOJIS.map(e => (
              <button key={e} onClick={() => handleEmoji(e)} className="text-2xl p-1.5 hover:bg-gray-100 rounded-lg">
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEmoji(v => !v)} className="p-2.5 text-gray-500 hover:text-blue-600 shrink-0" aria-label="Emoji">
            <Smile size={22} />
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Message likhein..."
            className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-w-0"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
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
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
  }, [query]);

  const handleInvite = async (userId: string) => {
    try {
      await onInvite(roomId, userId);
      setInvited(prev => new Set(prev).add(userId));
    } catch (err) {
      console.error('Failed to invite:', err);
    }
  };

  return (
    <Sheet title="Friend Invite Karein" onClose={onClose}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Username ya naam search karein"
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        autoFocus
      />
      {searching && <p className="text-sm text-gray-400">Search ho raha hai...</p>}
      <div className="space-y-2">
        {results.map(p => (
          <div key={p.id} className="flex items-center gap-3">
            {p.avatar_url ? (
              <img src={p.avatar_url} className="w-9 h-9 rounded-full object-cover" alt={p.username} />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                {(p.display_name || p.username).charAt(0).toUpperCase()}
              </div>
            )}
            <span className="flex-1 text-sm text-gray-900 truncate">{p.display_name || p.username}</span>
            <button
              onClick={() => handleInvite(p.id)}
              disabled={invited.has(p.id)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {invited.has(p.id) ? 'Invited' : 'Invite'}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
