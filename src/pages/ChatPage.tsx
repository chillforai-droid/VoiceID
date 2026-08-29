import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Send, Loader2, ArrowLeft, Phone, Video, Image as ImageIcon, WifiOff, Clock3 } from 'lucide-react';
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
      sendTypingState(false);
      setIsOtherTyping(false);
      channelRef.current = null;
      supabase.removeChannel(subscription);
    };
  }, [id, user, authLoading]);

  useEffect(() => {
    if (!isNetworkOnline) return;
    void flushOutbox();
  }, [isNetworkOnline, id, user]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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

    if (navigator.onLine) {
      await flushOutbox();
    }
  };

  // VoiceRecorder already performed the upload + DB insert; it hands us the
  // finished row so it can appear (with the entrance animation) right away
  // instead of waiting on the realtime INSERT event to round-trip back.
  const handleVoiceMessageSent = (message: any) => {
    setMessages(prev => prev.find(m => m.id === message.id) ? prev : [...prev, message]);
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

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="pt-safe sticky top-0 bg-white border-b border-gray-200 p-3 sm:p-4 flex items-center gap-2 sm:gap-3 z-10">
        <button onClick={() => navigate('/dashboard/messages')} className="p-2 hover:bg-gray-100 rounded-full shrink-0" aria-label="Back to conversations">
            <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold overflow-hidden shrink-0">
             {otherUser?.profiles?.avatar_url ? <img src={otherUser.profiles.avatar_url} alt="" decoding="async" className="w-full h-full object-cover" /> : otherUser?.profiles?.display_name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate flex items-center gap-1.5">
            {otherUser?.profiles?.display_name || 'Conversation'}
            {otherUser?.profiles?.is_ai && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">AI</span>
            )}
          </div>
          <div className="text-xs min-h-4 truncate">
            {otherUser?.profiles?.is_ai ? (
              isOtherTyping ? <span className="text-blue-600 font-medium">typing...</span> : <span className="text-gray-400">AI companion</span>
            ) : isOtherTyping ? <span className="text-blue-600 font-medium">typing...</span> : isNetworkOnline ? (isUserOnline(otherUser?.user_id) ? <span className="text-green-600">online</span> : <span className="text-gray-400">offline</span>) : <span className="text-amber-600">You’re offline · messages will send when online</span>}
          </div>
        </div>
        {otherUser && !otherUser?.profiles?.is_ai && (
            <div className="flex items-center gap-1 shrink-0">
                <button onClick={handleVideoCall} disabled={!isNetworkOnline || !isUserOnline(otherUser.user_id)} className={`p-2 hover:bg-gray-100 rounded-full disabled:opacity-40 ${isUserOnline(otherUser.user_id) ? 'text-gray-600' : 'text-gray-400'}`} aria-label="Video Call">
                    <Video size={20} />
                </button>
                <button onClick={handleCall} disabled={!isNetworkOnline || !isUserOnline(otherUser.user_id)} className={`p-2 hover:bg-gray-100 rounded-full disabled:opacity-40 ${isUserOnline(otherUser.user_id) ? 'text-gray-600' : 'text-gray-400'}`} aria-label="Call">
                    <Phone size={20} />
                </button>
                <div className={`w-2 h-2 rounded-full shrink-0 ${isUserOnline(otherUser.user_id) && isNetworkOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
            </div>
        )}
      </div>
      
      {!isNetworkOnline && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs sm:text-sm flex items-center gap-2">
          <WifiOff size={15} />
          <span>Offline mode: chat is still available. New messages are saved on this device and will sync automatically.</span>
        </div>
      )}
      {isNetworkOnline && pendingCount > 0 && (
        <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 text-blue-700 text-xs flex items-center gap-2">
          <Clock3 size={14} />
          <span>Syncing {pendingCount} pending message{pendingCount > 1 ? 's' : ''}…</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 sm:space-y-4">
        {messages.map((m) => {
          const receipt = receipts[m.id];
          const receiptStatus: 'sent' | 'delivered' | 'read' = receipt?.read_at ? 'read' : receipt?.delivered_at ? 'delivered' : 'sent';
          return (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={m.sender_id === user?.id}
            receiptStatus={receiptStatus}
            isHighlighted={highlightedMessageId === m.id}
            isSelected={selectedMessageId === m.id}
            isEditing={editingMessage?.id === m.id}
            editContent={editContent}
            onEditContentChange={setEditContent}
            onSaveEdit={updateMessage}
            onCancelEdit={() => setEditingMessage(null)}
            onToggleSelect={() => setSelectedMessageId(selectedMessageId === m.id ? null : m.id)}
            onStartEdit={() => { setEditingMessage(m); setEditContent(m.content_body.replace(" (edited)", "")); setSelectedMessageId(null); }}
            onRequestDelete={() => { setMessageToDelete(m); setSelectedMessageId(null); }}
          />
          );
        })}
        <div ref={scrollRef} />
      </div>
      
      <ConfirmDialog
        isOpen={!!messageToDelete}
        title="Delete Message"
        message="Are you sure you want to delete this message?"
        onConfirm={async () => {
            await deleteMessage(messageToDelete);
            setMessageToDelete(null);
        }}
        onCancel={() => setMessageToDelete(null)}
      />
      
      
      <form onSubmit={sendMessage} className="pb-safe p-2 sm:p-4 bg-white border-t flex gap-1 sm:gap-2 w-full items-center">
        <VoiceRecorder onMessageSent={handleVoiceMessageSent} onBusyChange={setIsVoiceComposerBusy} />
        {!isVoiceComposerBusy && (
          <>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 hover:bg-gray-100 rounded-full shrink-0 text-gray-500" aria-label="Attach image">
                <ImageIcon size={20} />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            <input 
              value={newMessage}
              onChange={(e) => handleTyping(e.target.value)}
              className="flex-1 p-3 px-4 bg-gray-100 border-none rounded-full outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
              placeholder={isNetworkOnline ? "Message..." : "Message offline..."}
            />
            <button type="submit" disabled={!newMessage.trim()} className="p-3 bg-blue-600 text-white rounded-full shrink-0 disabled:opacity-50" aria-label="Send message">{isNetworkOnline ? <Send size={20} /> : <WifiOff size={19} />}</button>
          </>
        )}
      </form>
    </div>
  );
}
