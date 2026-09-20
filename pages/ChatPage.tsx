import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Send, Loader2, ArrowLeft, Phone, Video, Image as ImageIcon, WifiOff, Clock3, MoreVertical, Plus, Smile, Camera } from 'lucide-react';
import { VoiceRecorder } from '../components/chat/VoiceRecorder';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ConfirmDialog } from '../components/chat/ConfirmDialog';
import { MediaCache } from '../lib/MediaCache';
import { useVoiceCall } from '../hooks/useVoiceCall';
import { usePresence } from '../context/PresenceContext';
import { OfflineMessageStore } from '../lib/OfflineMessageStore';
import { uploadMediaWithRetry } from '../lib/uploadMediaWithRetry';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { markConversationRead, setActiveConversationId } = useNotifications();
  const { initiateCall, canCallUser } = useVoiceCall();
  const { isUserOnline } = usePresence();
  const [messages, setMessages] = useState<any[]>([]);
  // Per-message delivered/read state for messages *we* sent, keyed by
  // message id — drives the single/double/blue-double tick in
  // MessageBubble. Populated from an initial fetch plus a realtime
  // subscription to message_receipts (see the channel setup below).
  const [receipts, setReceipts] = useState<Record<string, { delivered_at: string | null; read_at: string | null }>>({});
  // Guards against re-firing the mark-read/mark-delivered RPC for a message
  // we've already acknowledged in this session (the messages array can
  // re-render for unrelated reasons — edits, other realtime events).
  const acknowledgedRef = useRef<Set<string>>(new Set());
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [editContent, setEditContent] = useState('');
  const [messageToDelete, setMessageToDelete] = useState<any>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [isVoiceComposerBusy, setIsVoiceComposerBusy] = useState(false);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [isNetworkOnline, setIsNetworkOnline] = useState(() => navigator.onLine);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  // Set locally the moment we send something to an AI persona (the backend
  // replies async via a DB webhook and never broadcasts a 'typing' event
  // like a real user's client does), and cleared once their reply lands or
  // a safety timeout passes.
  const [aiThinking, setAiThinking] = useState(false);
  const aiThinkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);
  const flushingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const goOnline = () => setIsNetworkOnline(true);
    const goOffline = () => setIsNetworkOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const sendTypingState = (typing: boolean) => {
    if (!channelRef.current || !user) return;
    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id, typing },
    });
  };

  // Kicks off the "AI is typing" bubble right after we send it something.
  // 30s safety timeout in case the reply never lands (rate limit, both LLM
  // providers down, etc.) so the bubble doesn't hang forever.
  const startAiThinking = () => {
    if (!otherUser?.profiles?.is_ai) return;
    setAiThinking(true);
    if (aiThinkingTimer.current) clearTimeout(aiThinkingTimer.current);
    aiThinkingTimer.current = setTimeout(() => setAiThinking(false), 30000);
  };

  const handleTyping = (value: string) => {
    setNewMessage(value);
    if (!value.trim()) {
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      sendTypingState(false);
      return;
    }

    sendTypingState(true);
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => sendTypingState(false), 1800);
  };

  const flushOutbox = async () => {
    if (!id || !user || !navigator.onLine || flushingRef.current) return;
    flushingRef.current = true;
    try {
      const queued = await OfflineMessageStore.getOutbox(id);
      setPendingCount(queued.length);
      for (const item of queued) {
        const { data, error } = await supabase.from('messages').insert({
          id: item.id,
          conversation_id: item.conversation_id,
          sender_id: item.sender_id,
          content_body: item.content_body,
          content_type: item.content_type,
        }).select().single();

        if (data) {
          await OfflineMessageStore.removeOutbox(item.id);
          await OfflineMessageStore.upsertMessage(data);
          setMessages(prev => prev.map(m => m.id === item.id ? data : m));
        } else if (error) {
          // A lost response after a successful insert can surface as a unique-id
          // error. The row already exists, so treat it as delivered.
          const { data: existing } = await supabase.from('messages').select('*').eq('id', item.id).maybeSingle();
          if (existing) {
            await OfflineMessageStore.removeOutbox(item.id);
            await OfflineMessageStore.upsertMessage(existing);
            setMessages(prev => prev.map(m => m.id === item.id ? existing : m));
          } else if (error.code === '42501' || error.status === 401 || error.status === 403) {
            // Permission/auth errors should not be retried forever.
            await OfflineMessageStore.removeOutbox(item.id);
          } else {
            break;
          }
        }
      }
      setPendingCount((await OfflineMessageStore.getOutbox(id)).length);
    } finally {
      flushingRef.current = false;
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;

    // Reset file input
    e.target.value = '';

    const messageId = crypto.randomUUID();
    const localUrl = URL.createObjectURL(file);

    // Optimistic UI: the bubble appears immediately (with the exact bytes
    // the user picked, via _previewUrl) instead of only after the upload
    // finishes and the realtime INSERT event round-trips back. This is what
    // gives the "sending" animation something to animate in right away.
    const localMessage = {
      id: messageId,
      conversation_id: id,
      sender_id: user.id,
      content_body: '',
      content_type: 'image',
      created_at: new Date().toISOString(),
      mime_type: file.type,
      byte_size: file.size,
      local_pending: true,
      _previewUrl: localUrl,
    };
    setMessages(prev => [...prev, localMessage]);

    const markFailed = (reason?: string) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, local_pending: false, local_failed: true, local_failed_reason: reason } : m));
    };

    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      let objectKey: string;
      try {
        objectKey = await uploadMediaWithRetry(file, file.type);
      } catch (uploadErr: any) {
        console.error("handleImageUpload: upload failed", uploadErr);
        markFailed(uploadErr?.message);
        return;
      }

      const { data: message, error: dbError } = await supabase.from('messages').insert({
        id: messageId,
        conversation_id: id,
        sender_id: user.id,
        content_body: '',
        content_type: 'image',
        b2_object_key: objectKey,
        sha256: sha256,
        media_status: 'delivered',
        mime_type: file.type,
        byte_size: file.size
      }).select().single();

      if (dbError || !message) {
        console.error('Image message insert error:', dbError);
        markFailed('Could not save the message. Please try again.');
        return;
      }

      startAiThinking();

      // Cache the blob under the same id used above, so the fetch path
      // ImageMessage falls back to (once _previewUrl is dropped) hits the
      // cache instantly instead of downloading what we already have.
      await MediaCache.putMedia({
        messageId: message.id,
        mediaType: 'image',
        blob: file,
        mimeType: file.type,
        byteSize: file.size,
        createdAt: Date.now(),
        sha256: sha256,
        deliveryStatus: 'delivered'
      });

      setMessages(prev => prev.map(m => m.id === messageId ? message : m));
      URL.revokeObjectURL(localUrl);
    } catch (err: any) {
      console.error('handleImageUpload: failed', err);
      markFailed(err?.message);
    }
  };

  const handleCall = async () => {
      if (!otherUser?.user_id) return;
      const { canCall, reason } = await canCallUser(otherUser.user_id);
      if (!canCall) {
          alert(reason);
      } else {
          initiateCall(otherUser.user_id, 'voice');
      }
  };

  const handleVideoCall = async () => {
      if (!otherUser?.user_id) return;
      const { canCall, reason } = await canCallUser(otherUser.user_id);
      if (!canCall) {
          alert(reason);
      } else {
          initiateCall(otherUser.user_id, 'video');
      }
  };

  // Notification-system only: lets the bell/notifications page know this
  // conversation is currently open, so new message notifications for it
  // are marked read instantly instead of bumping the unread badge.
  useEffect(() => {
    setActiveConversationId(id ?? null);
    return () => setActiveConversationId(null);
  }, [id, setActiveConversationId]);

  useEffect(() => {
    if (id) markConversationRead(id);
    if (authLoading || !id || !user) return;

    let cancelled = false;

    const hydrateFromCache = async () => {
      const [cached, queued] = await Promise.all([
        OfflineMessageStore.getConversation(id),
        OfflineMessageStore.getOutbox(id),
      ]);
      if (!cancelled && cached.length) setMessages(cached);
      if (!cancelled) setPendingCount(queued.length);
    };

    const fetchMessagesAndUser = async () => {
      await hydrateFromCache();
      if (!navigator.onLine) {
        if (!cancelled) setMessagesLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(display_name)')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (!cancelled && !error && data) {
        setMessages(data);
        await OfflineMessageStore.cacheConversation(id, data);

        // Pull the current delivered/read state for everything *we* sent,
        // so ticks are correct immediately on load instead of only after
        // the next realtime receipt update.
        const ownMessageIds = data.filter((m: any) => m.sender_id === user.id).map((m: any) => m.id);
        if (ownMessageIds.length > 0) {
          const { data: receiptRows } = await supabase
            .from('message_receipts')
            .select('message_id, delivered_at, read_at, played_at')
            .in('message_id', ownMessageIds);
          if (!cancelled && receiptRows) {
            setReceipts(prev => {
              const next = { ...prev };
              for (const r of receiptRows) {
                next[r.message_id] = { delivered_at: r.delivered_at, read_at: r.read_at || r.played_at };
              }
              return next;
            });
          }
        }
      }
      if (!cancelled) setMessagesLoading(false);

      const { data: members } = await supabase.from('conversation_members').select('user_id, profiles(display_name, avatar_url, is_ai)').eq('conversation_id', id).neq('user_id', user.id);
      if (!cancelled && members && members.length > 0) setOtherUser(members[0]);
      await flushOutbox();
    };

    setMessagesLoading(true);
    fetchMessagesAndUser();

    const subscription = supabase
      .channel(`messages:${id}`, { config: { broadcast: { ack: false, self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (!payload?.userId || payload.userId === user.id) return;
        setIsOtherTyping(Boolean(payload.typing));
        if (remoteTypingTimer.current) clearTimeout(remoteTypingTimer.current);
        if (payload.typing) {
          remoteTypingTimer.current = setTimeout(() => setIsOtherTyping(false), 2500);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async (payload) => {
        const message = payload.new as any;
        await OfflineMessageStore.upsertMessage(message);
        setMessages(prev => {
          if (prev.find(m => m.id === message.id)) return prev.map(m => m.id === message.id ? message : m);
          return [...prev, message].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
        if (message.sender_id !== user.id) {
          if (aiThinkingTimer.current) clearTimeout(aiThinkingTimer.current);
          setAiThinking(false);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async (payload) => {
        const message = payload.new as any;
        await OfflineMessageStore.upsertMessage(message);
        setMessages(prev => prev.map(m => m.id === message.id ? message : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async (payload) => {
        await OfflineMessageStore.deleteMessage(id, payload.old.id);
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      // No conversation_id column to filter on server-side here — RLS
      // already scopes this to receipts on messages in conversations the
      // current user belongs to, so this can pick up rows from a
      // different open conversation too; that's harmless, it just adds an
      // unused entry to the receipts map.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_receipts' }, (payload) => {
        const row: any = payload.new || payload.old;
        if (!row?.message_id) return;
        setReceipts(prev => ({
          ...prev,
          [row.message_id]: { delivered_at: row.delivered_at, read_at: row.read_at || row.played_at },
        }));
      })
      .subscribe(() => {
        void flushOutbox();
      });

    channelRef.current = subscription;

    return () => {
      cancelled = true;
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      if (remoteTypingTimer.current) clearTimeout(remoteTypingTimer.current);
      if (aiThinkingTimer.current) clearTimeout(aiThinkingTimer.current);
      sendTypingState(false);
      setIsOtherTyping(false);
      setAiThinking(false);
      channelRef.current = null;
      supabase.removeChannel(subscription);
    };
  }, [id, user, authLoading]);

  useEffect(() => {
    if (!isNetworkOnline) return;
    void flushOutbox();
  }, [isNetworkOnline, id, user]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, aiThinking]);

  // This is the fix for "double tick nahi dikhta": the recipient's browser
  // never told the sender the message had been seen, because nothing in
  // the app called the mark_message_read / acknowledge_voice_delivery RPCs
  // that already existed server-side. With the conversation open, every
  // incoming (not-our-own) message is acknowledged here — text/image via
  // mark_message_read (delivered+read together, since seeing it in an open
  // chat means both), voice via the voice-specific delivery RPC (its own
  // "read"/played receipt is fired separately, from actual playback in
  // VoiceMessage.tsx, since delivery isn't the same as having listened).
  useEffect(() => {
    if (!user || !id) return;
    const incoming = messages.filter(m => m.sender_id !== user.id && !m.local_pending && !acknowledgedRef.current.has(m.id));
    if (incoming.length === 0) return;
    incoming.forEach(m => acknowledgedRef.current.add(m.id));
    (async () => {
      for (const m of incoming) {
        try {
          if (m.content_type === 'voice') {
            await supabase.rpc('acknowledge_voice_delivery', { p_message_id: m.id });
          } else {
            await supabase.rpc('mark_message_read', { p_message_id: m.id });
          }
        } catch (err) {
          console.error('Failed to acknowledge message receipt', m.id, err);
          acknowledgedRef.current.delete(m.id);
        }
      }
    })();
  }, [messages, user, id]);

  // Deep link support: notifications for a specific message (e.g. a new
  // message notification) can carry ?m=<messageId> so we scroll straight
  // to it and briefly highlight it, then clean the param from the URL.
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  useEffect(() => {
    const targetId = searchParams.get('m');
    if (!targetId || messagesLoading) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(targetId);
      const timeout = setTimeout(() => setHighlightedMessageId(null), 2000);
      setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('m'); return next; }, { replace: true });
      return () => clearTimeout(timeout);
    }
  }, [searchParams, messagesLoading, setSearchParams]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = newMessage.trim();
    if (!body || !user || !id) return;

    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    sendTypingState(false);
    setNewMessage('');

    const localMessage = {
      id: crypto.randomUUID(),
      conversation_id: id,
      sender_id: user.id,
      content_body: body,
      content_type: 'text',
      created_at: new Date().toISOString(),
      local_pending: true,
      queued_at: Date.now(),
    };

    // Optimistic UI: the message appears immediately even on flaky mobile data.
    setMessages(prev => [...prev, localMessage]);
    await OfflineMessageStore.queueMessage(localMessage);
    setPendingCount((count) => count + 1);
    startAiThinking();

    if (navigator.onLine) {
      await flushOutbox();
    }
  };

  // VoiceRecorder already performed the upload + DB insert; it hands us the
  // finished row so it can appear (with the entrance animation) right away
  // instead of waiting on the realtime INSERT event to round-trip back.
  const handleVoiceMessageSent = (message: any) => {
    setMessages(prev => prev.find(m => m.id === message.id) ? prev : [...prev, message]);
    startAiThinking();
  };

  const deleteMessage = async (m: any) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    
    // .select() forces PostgREST to return the row(s) actually deleted.
    // Without it, a DELETE blocked by RLS (0 rows affected) still comes
    // back with error: null, which would make this look successful even
    // though nothing changed in the database.
    const { data: deleteData, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', m.id)
        .select();

    if (error) { 
        console.error("Delete failed", error);
        alert('Failed to delete message: ' + error.message); 
        return; 
    }

    if (!deleteData || deleteData.length === 0) {
        console.error("Delete affected 0 rows (blocked by RLS or already deleted)", m.id);
        alert('Failed to delete message: you may not have permission to delete this message.');
        return;
    }
    
    if (m.b2_object_key) {
        await fetch(`/api/media/delete/${m.b2_object_key}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }
    await MediaCache.deleteMedia(m.id);
    setMessages(prev => prev.filter(msg => msg.id !== m.id));
  };

  const updateMessage = async () => {
    if (!editingMessage || !editContent.trim()) return;
    const { data, error } = await supabase.from('messages').update({ content_body: editContent + " (edited)" }).eq('id', editingMessage.id).select();
    if (error) {
        alert('Failed to update message: ' + error.message);
    } else if (!data || data.length === 0) {
        alert('Failed to update message: you may not have permission to edit this message.');
    } else {
        setMessages(prev =>
            prev.map(msg =>
                msg.id === editingMessage.id
                ? {
                    ...msg,
                    content_body: editContent + " (edited)"
                }
                : msg
            )
        );
        setEditingMessage(null);
        setEditContent('');
    }
  };

  if (authLoading || messagesLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!user) return <div className="p-20 text-center">Please sign in to chat.</div>;

  const displayName = otherUser?.profiles?.display_name || 'Conversation';
  const online = Boolean(otherUser?.user_id && isUserOnline(otherUser.user_id) && isNetworkOnline);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f7f9ff] text-slate-950">
      <header className="sticky top-0 z-20 shrink-0 border-b border-white/70 bg-gradient-to-r from-violet-50 via-white to-sky-50 px-3 pb-3 pt-[max(0.7rem,env(safe-area-inset-top))] shadow-[0_8px_30px_rgba(79,70,229,0.08)] sm:px-5">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate('/dashboard/messages')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/80 text-slate-700 shadow-sm ring-1 ring-slate-200/70 transition hover:bg-white" aria-label="Back to conversations">
            <ArrowLeft size={21} />
          </button>
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-violet-200 to-sky-200 p-[2px] shadow-sm">
            <div className="h-full w-full overflow-hidden rounded-full bg-white">
              {otherUser?.profiles?.avatar_url ? <img src={otherUser.profiles.avatar_url} alt={displayName} decoding="async" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-base font-extrabold text-violet-700">{displayName.charAt(0).toUpperCase()}</div>}
            </div>
            <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-[17px] font-extrabold tracking-tight">{displayName}</h1>
              {otherUser?.profiles?.is_ai && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-extrabold text-violet-700">AI</span>}
            </div>
            <div className="truncate text-xs font-medium text-slate-500">
              {otherUser?.profiles?.is_ai ? (isOtherTyping || aiThinking ? <span className="text-violet-600">typing...</span> : <span>AI companion</span>) : isOtherTyping ? <span className="text-violet-600">typing...</span> : !isNetworkOnline ? <span className="text-amber-600">Offline · messages will sync</span> : online ? <span className="text-emerald-600">Online</span> : <span>Offline</span>}
            </div>
          </div>
          {otherUser && !otherUser?.profiles?.is_ai && (
            <div className="flex shrink-0 items-center gap-0.5">
              <button onClick={handleVideoCall} disabled={!isNetworkOnline} className="grid h-10 w-10 place-items-center rounded-full text-slate-700 transition hover:bg-white/80 disabled:opacity-40" aria-label="Video Call"><Video size={21} /></button>
              <button onClick={handleCall} disabled={!isNetworkOnline} className="grid h-10 w-10 place-items-center rounded-full text-slate-700 transition hover:bg-white/80 disabled:opacity-40" aria-label="Call"><Phone size={21} /></button>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-slate-600 transition hover:bg-white/80" aria-label="More options"><MoreVertical size={20} /></button>
            </div>
          )}
        </div>
      </header>

      {!isNetworkOnline && (
        <div className="z-10 flex shrink-0 items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800"><WifiOff size={14} /><span>Offline mode · new messages are saved and will sync automatically.</span></div>
      )}
      {isNetworkOnline && pendingCount > 0 && (
        <div className="z-10 flex shrink-0 items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-1.5 text-xs font-medium text-indigo-700"><Clock3 size={14} /><span>Syncing {pendingCount} pending message{pendingCount > 1 ? 's' : ''}…</span></div>
      )}

      <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-5 pt-4 sm:px-5">
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-45">
          <div className="absolute -left-16 top-20 h-44 w-44 rounded-full bg-violet-200/30 blur-3xl" />
          <div className="absolute -right-20 top-1/2 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-5 flex justify-center"><span className="rounded-full bg-white/75 px-4 py-1.5 text-xs font-bold text-slate-500 shadow-sm ring-1 ring-slate-200/70 backdrop-blur">Today</span></div>
          <div className="space-y-3.5 sm:space-y-4">
            {messages.map((m) => {
              const receipt = receipts[m.id];
              const receiptStatus: 'sent' | 'delivered' | 'read' = receipt?.read_at ? 'read' : receipt?.delivered_at ? 'delivered' : 'sent';
              return <MessageBubble key={m.id} message={m} isOwn={m.sender_id === user?.id} receiptStatus={receiptStatus} isHighlighted={highlightedMessageId === m.id} isSelected={selectedMessageId === m.id} isEditing={editingMessage?.id === m.id} editContent={editContent} onEditContentChange={setEditContent} onSaveEdit={updateMessage} onCancelEdit={() => setEditingMessage(null)} onToggleSelect={() => setSelectedMessageId(selectedMessageId === m.id ? null : m.id)} onStartEdit={() => { setEditingMessage(m); setEditContent(m.content_body.replace(" (edited)", "")); setSelectedMessageId(null); }} onRequestDelete={() => { setMessageToDelete(m); setSelectedMessageId(null); }} />;
            })}
            {aiThinking && (
              <div className="flex justify-start"><div className="rounded-[22px] rounded-bl-md bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/70"><div className="flex items-center gap-1.5"><span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" /><span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:150ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:300ms]" /></div></div></div>
            )}
          </div>
          <div ref={scrollRef} />
        </div>
      </main>

      <ConfirmDialog isOpen={!!messageToDelete} title="Delete Message" message="Are you sure you want to delete this message?" onConfirm={async () => { await deleteMessage(messageToDelete); setMessageToDelete(null); }} onCancel={() => setMessageToDelete(null)} />

      <form onSubmit={sendMessage} className="shrink-0 border-t border-white/80 bg-white/90 px-3 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:px-5 sm:pb-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-[28px] bg-slate-100/90 p-1.5 ring-1 ring-slate-200/80">
          <VoiceRecorder onMessageSent={handleVoiceMessageSent} onBusyChange={setIsVoiceComposerBusy} />
          {!isVoiceComposerBusy && (
            <>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-slate-600 shadow-sm transition hover:text-violet-600" aria-label="Add attachment"><Plus size={22} /></button>
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" capture="environment" className="hidden" />
              <div className="relative flex min-w-0 flex-1 items-center">
                <input value={newMessage} onChange={(e) => handleTyping(e.target.value)} className="h-11 w-full min-w-0 bg-transparent px-3 pr-20 text-[15px] text-slate-900 outline-none placeholder:text-slate-400" placeholder={isNetworkOnline ? 'Message...' : 'Message offline...'} />
                <div className="absolute right-1 flex items-center gap-0.5 text-slate-500">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white" aria-label="Camera"><Camera size={19} /></button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white" aria-label="Add image"><ImageIcon size={19} /></button>
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white" aria-label="Emoji"><Smile size={19} /></button>
                </div>
              </div>
              <button type="submit" disabled={!newMessage.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-indigo-200 transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100" aria-label="Send message">{isNetworkOnline ? <Send size={19} /> : <WifiOff size={18} />}</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
