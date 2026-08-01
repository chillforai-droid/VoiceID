import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Send, Loader2, ArrowLeft, Phone, Image as ImageIcon } from 'lucide-react';
import { VoiceRecorder } from '../components/chat/VoiceRecorder';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ConfirmDialog } from '../components/chat/ConfirmDialog';
import { MediaCache } from '../lib/MediaCache';
import { useVoiceCall } from '../hooks/useVoiceCall';
import { usePresence } from '../context/PresenceContext';

export default function ChatPage() {
  // Previously the entire conversation history was fetched in one
  // unbounded query on every open — fine for a new conversation, but it
  // gets slower and heavier (network + memory) the longer a conversation
  // lives. This caps the initial load and pages older messages in on
  // demand instead.
  const PAGE_SIZE = 50;
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { markConversationRead, setActiveConversationId } = useNotifications();
  const { initiateCall, canCallUser } = useVoiceCall();
  const { isUserOnline } = usePresence();
  const [messages, setMessages] = useState<any[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const deepLinkAttemptsRef = useRef(0);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [editContent, setEditContent] = useState('');
  const [messageToDelete, setMessageToDelete] = useState<any>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [otherUserRecording, setOtherUserRecording] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;
    
    // Reset file input
    e.target.value = '';
    
    // Set preview (revoking any previous preview URL first so we don't
    // accumulate Blob URLs across multiple attachments in one session)
    if (previewImage) URL.revokeObjectURL(previewImage);
    setPreviewImage(URL.createObjectURL(file));
    
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    
    const uploadRes = await fetch("/api/media/upload", {
      method: "POST",
      headers: { 
        "Content-Type": file.type,
        "Authorization": `Bearer ${token}` 
      },
      body: file,
    });
    
    if (!uploadRes.ok) {
        console.error("handleImageUpload: proxy upload failed", await uploadRes.text());
        throw new Error("Failed to upload to storage");
    }
    
    const { objectKey } = await uploadRes.json();
    
    const { data: message, error: dbError } = await supabase.from('messages').insert({
        conversation_id: id,
        sender_id: user.id,
        content_body: '',
        content_type: 'image',
        b2_object_key: objectKey,
        sha256: sha256,
        media_status: 'delivered', // Change to delivered
        mime_type: file.type,
        byte_size: file.size
    }).select().single();
    
    if (dbError) {
        console.error('Image message insert error:', dbError);
    } else {
        // Cache the blob
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
        setPreviewImage(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    }
  };

  const handleCall = async () => {
      if (!otherUser?.user_id) return;
      const { canCall, reason } = await canCallUser(otherUser.user_id);
      if (!canCall) {
          alert(reason);
      } else {
          initiateCall(otherUser.user_id);
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

    const fetchMessagesAndUser = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(display_name)')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (!error && data) {
        setMessages([...data].reverse());
        setHasMoreOlder(data.length === PAGE_SIZE);
      }
      setMessagesLoading(false);

      const { data: members } = await supabase.from('conversation_members').select('user_id, profiles(display_name, avatar_url)').eq('conversation_id', id).neq('user_id', user.id);
      if (members && members.length > 0) setOtherUser(members[0]);
    };

    fetchMessagesAndUser();

    const subscription = supabase
      .channel(`messages:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        setMessages(prev => {
          const existingIdx = prev.findIndex(m => m.id === payload.new.id);
          if (existingIdx !== -1) {
            // Confirms an optimistic (locally-echoed) message this client
            // sent itself — replace the placeholder with the real row
            // instead of dropping the realtime event, so it doesn't get
            // stuck showing "Sending..." forever.
            const next = [...prev];
            next[existingIdx] = payload.new;
            return next;
          }
          return [...prev, payload.new].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      // Typing indicator: ephemeral broadcast on the same channel already
      // subscribed for message changes (Realtime multiplexes postgres_changes
      // and broadcast over one connection, so this doesn't need a second
      // channel/subscription). Not persisted anywhere — purely presence-like.
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user_id === user.id) return;
        setOtherUserTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setOtherUserTyping(false), 3000);
      })
      // Recording indicator: same ephemeral-broadcast approach as typing.
      // The sender re-sends every ~2s while actively recording (see
      // ChatPage's onRecordingStateChange handler), and explicitly sends
      // {recording:false} on stop; the 4s decay here is just a safety net
      // in case that final event is lost (e.g. tab closed mid-recording).
      .on('broadcast', { event: 'recording' }, (payload) => {
        if (payload.payload?.user_id === user.id) return;
        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
        if (payload.payload?.recording) {
          setOtherUserRecording(true);
          recordingTimeoutRef.current = setTimeout(() => setOtherUserRecording(false), 4000);
        } else {
          setOtherUserRecording(false);
        }
      })
      .subscribe((status) => {
      });

    channelRef.current = subscription;

    return () => {
      supabase.removeChannel(subscription);
      channelRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      if (recordingBroadcastIntervalRef.current) clearInterval(recordingBroadcastIntervalRef.current);
      setOtherUserTyping(false);
      setOtherUserRecording(false);
    };
  }, [id, user, authLoading]);

  // Guarded so loading older history (prepended to the top) doesn't yank
  // the view back down to the bottom — only new messages at the end
  // (or the initial load) should trigger an auto-scroll.
  const skipAutoScrollRef = useRef(false);
  useEffect(() => {
    if (skipAutoScrollRef.current) { skipAutoScrollRef.current = false; return; }
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Safety net: revoke the attachment preview URL if the user navigates
  // away mid-upload instead of cancelling or completing it.
  useEffect(() => {
    return () => { if (previewImage) URL.revokeObjectURL(previewImage); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMoreOlder || messages.length === 0 || !id) return;
    setLoadingOlder(true);
    const oldest = messages[0];
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles(display_name)')
      .eq('conversation_id', id)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (!error && data) {
      skipAutoScrollRef.current = true;
      setMessages(prev => [...[...data].reverse(), ...prev]);
      setHasMoreOlder(data.length === PAGE_SIZE);
    }
    setLoadingOlder(false);
  };

  // Deep link support: notifications for a specific message (e.g. a new
  // message notification) can carry ?m=<messageId> so we scroll straight
  // to it and briefly highlight it, then clean the param from the URL.
  // Since messages now load a page at a time (see PAGE_SIZE above), an
  // older linked message may not be in the first page yet — this keeps
  // paging older messages in until it's found, up to a sane bound.
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  useEffect(() => {
    const targetId = searchParams.get('m');
    if (!targetId || messagesLoading) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      deepLinkAttemptsRef.current = 0;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(targetId);
      const timeout = setTimeout(() => setHighlightedMessageId(null), 2000);
      setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('m'); return next; }, { replace: true });
      return () => clearTimeout(timeout);
    }
    // Not found in what's currently loaded — page in older history and
    // this effect will re-run once `messages` updates. Bounded so a
    // stale/invalid message id (e.g. it was since deleted) doesn't loop
    // forever paging through the entire conversation.
    if (hasMoreOlder && !loadingOlder && deepLinkAttemptsRef.current < 20) {
      deepLinkAttemptsRef.current += 1;
      loadOlderMessages();
    }
  }, [searchParams, messagesLoading, setSearchParams, messages, hasMoreOlder, loadingOlder]);

  const loadOlderRef = useRef(loadOlderMessages);
  useEffect(() => { loadOlderRef.current = loadOlderMessages; });

  useEffect(() => {
    if (!hasMoreOlder) return;
    const sentinel = topSentinelRef.current;
    const container = messagesContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadOlderRef.current();
    }, { root: container, threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreOlder, id, messagesLoading]);

  const recordingBroadcastIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleRecordingStateChange = (isRecording: boolean) => {
    if (!channelRef.current || !user) return;
    const send = () => channelRef.current?.send({ type: 'broadcast', event: 'recording', payload: { user_id: user.id, recording: isRecording } });
    send();
    if (recordingBroadcastIntervalRef.current) clearInterval(recordingBroadcastIntervalRef.current);
    if (isRecording) {
      recordingBroadcastIntervalRef.current = setInterval(send, 2000);
    }
  };

  const handleMessageInputChange = (value: string) => {
    setNewMessage(value);
    // Throttle to at most once every 2s so every keystroke doesn't send a
    // broadcast — the receiving side already holds "typing" for 3s after
    // the last event, so this cadence keeps the indicator feeling live
    // without spamming the channel.
    const now = Date.now();
    if (value.trim() && now - lastTypingSentRef.current > 2000 && channelRef.current && user) {
      lastTypingSentRef.current = now;
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id } });
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || !user || !id) return;

    setNewMessage('');

    // Optimistic local echo: previously the message only appeared once the
    // realtime subscription echoed the INSERT back, which meant a visible
    // delay on every send and, if realtime was briefly disconnected, your
    // own message wouldn't show up at all until it reconnected. The id is
    // generated client-side (same pattern already used for voice messages)
    // so the realtime INSERT handler above can reconcile it by id.
    const clientId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: clientId,
      conversation_id: id,
      sender_id: user.id,
      content_body: content,
      content_type: 'text',
      created_at: new Date().toISOString(),
      _status: 'sending',
    }]);

    const { data, error } = await supabase.from('messages').insert({
      id: clientId,
      conversation_id: id,
      sender_id: user?.id,
      content_body: content,
      content_type: 'text'
    }).select().single();

    if (error) {
        console.error('Message insert error:', error);
        setMessages(prev => prev.map(m => m.id === clientId ? { ...m, _status: 'failed' } : m));
    } else {
        setMessages(prev => prev.map(m => m.id === clientId ? data : m));
    }
  };

  const retrySendMessage = async (m: any) => {
    setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, _status: 'sending' } : msg));
    const { data, error } = await supabase.from('messages').insert({
      id: m.id,
      conversation_id: id,
      sender_id: user?.id,
      content_body: m.content_body,
      content_type: 'text'
    }).select().single();

    if (error) {
        console.error('Message retry failed:', error);
        setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, _status: 'failed' } : msg));
    } else {
        setMessages(prev => prev.map(msg => msg.id === m.id ? data : msg));
    }
  };

  const deleteMessage = async (m: any) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    // The B2 object delete must happen BEFORE the DB row is removed: the
    // server-side endpoint verifies the caller owns this object by looking
    // up the messages row for the given b2_object_key, so the row has to
    // still exist when that call is made. (Previously the DB row was
    // deleted first and the object delete request afterwards carried no
    // ownership check at all — see delete/[objectKey].ts.)
    if (m.b2_object_key) {
        const mediaDeleteRes = await fetch(`/api/media/delete/${m.b2_object_key}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!mediaDeleteRes.ok) {
            console.error("Media object delete failed", await mediaDeleteRes.text().catch(() => ''));
            // Non-fatal: still proceed to delete the message row itself so
            // the user isn't stuck unable to delete a message because
            // storage cleanup failed; the object is just orphaned in B2.
        }
    }

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
          <div className="font-semibold text-gray-900 truncate">{otherUser?.profiles?.display_name || 'Conversation'}</div>
          {otherUserRecording ? (
            <div className="text-xs text-red-500">recording voice message…</div>
          ) : otherUserTyping ? (
            <div className="text-xs text-blue-600">typing…</div>
          ) : null}
        </div>
        {otherUser && (
            <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleCall} className={`p-2 hover:bg-gray-100 rounded-full ${!isUserOnline(otherUser.user_id) ? 'text-gray-400' : 'text-gray-600'}`} aria-label="Call">
                    <Phone size={20} />
                </button>
                <div className={`w-2 h-2 rounded-full shrink-0 ${isUserOnline(otherUser.user_id) ? 'bg-green-500' : 'bg-gray-300'}`} />
            </div>
        )}
      </div>
      
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 sm:space-y-4">
        <div ref={topSentinelRef} />
        {loadingOlder && (
          <div className="flex justify-center py-2"><Loader2 className="animate-spin text-gray-400" size={18} /></div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={m.sender_id === user?.id}
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
            onRetry={() => retrySendMessage(m)}
          />
        ))}
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
      
      {previewImage && (
        <div className="p-2 border-t bg-white flex items-center gap-3">
          <img src={previewImage} alt="Preview" loading="lazy" decoding="async" className="h-16 w-16 sm:h-20 sm:w-20 rounded object-cover" />
          <button onClick={() => { URL.revokeObjectURL(previewImage); setPreviewImage(null); }} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-full hover:bg-gray-100">Cancel</button>
        </div>
      )}
      
      <form onSubmit={sendMessage} className="pb-safe p-2 sm:p-4 bg-white border-t flex gap-1 sm:gap-2 w-full items-center">
        <>
        <VoiceRecorder onSent={() => {}} onAudioPreview={(isPreview) => setIsPreviewMode(isPreview)} recipientId={otherUser?.user_id} onRecordingStateChange={handleRecordingStateChange} />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 hover:bg-gray-100 rounded-full shrink-0 text-gray-500" aria-label="Attach image">
            <ImageIcon size={20} />
        </button>
        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
        {!isPreviewMode && (
          <>
            <input 
              value={newMessage}
              onChange={(e) => handleMessageInputChange(e.target.value)}
              className="flex-1 p-3 px-4 bg-gray-100 border-none rounded-full outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
              placeholder="Message..."
            />
            <button type="submit" disabled={!newMessage.trim()} className="p-3 bg-blue-600 text-white rounded-full shrink-0 disabled:opacity-50" aria-label="Send message"><Send size={20} /></button>
          </>
        )}
        </>
      </form>
    </div>
  );
}
