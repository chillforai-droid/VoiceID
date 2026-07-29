import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Send, Loader2, ArrowLeft, Phone, Image as ImageIcon } from 'lucide-react';
import { ImageMessage } from '../components/chat/ImageMessage';
import { VoiceRecorder } from '../components/chat/VoiceRecorder';
import { VoiceMessage } from '../components/chat/VoiceMessage';
import { ConfirmDialog } from '../components/chat/ConfirmDialog';
import { MediaCache } from '../lib/MediaCache';
import { useVoiceCall } from '../hooks/useVoiceCall';
import { usePresence } from '../context/PresenceContext';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { markConversationRead } = useNotifications();
  const { initiateCall, canCallUser } = useVoiceCall();
  const { isUserOnline } = usePresence();
  const [messages, setMessages] = useState<any[]>([]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;
    
    // Reset file input
    e.target.value = '';
    
    // Set preview
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
        setPreviewImage(null);
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

  useEffect(() => {
    if (id) markConversationRead(id);
    if (authLoading || !id || !user) return;

    const fetchMessagesAndUser = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(display_name)')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (!error && data) setMessages(data);
      setMessagesLoading(false);

      const { data: members } = await supabase.from('conversation_members').select('user_id, profiles(display_name, avatar_url)').eq('conversation_id', id).neq('user_id', user.id);
      if (members && members.length > 0) setOtherUser(members[0]);
    };

    fetchMessagesAndUser();

    const subscription = supabase
      .channel(`messages:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe((status) => {
      });

    return () => { supabase.removeChannel(subscription); };
  }, [id, user, authLoading]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !id) return;

    const { data, error } = await supabase.from('messages').insert({
      conversation_id: id,
      sender_id: user?.id,
      content_body: newMessage,
      content_type: 'text'
    }).select().single();
    
    if (error) {
        console.error('Message insert error:', error);
        alert(`Failed to save message. Details: ${error.message}`);
    } else {
        setNewMessage('');
    }
  };

  const deleteMessage = async (m: any) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    
    const { data: deleteData, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', m.id);
    

    if (error) { 
        console.error("Delete failed", error);
        alert('Failed to delete message: ' + error.message); 
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
    const { error } = await supabase.from('messages').update({ content_body: editContent + " (edited)" }).eq('id', editingMessage.id);
    if (error) {
        alert('Failed to update message: ' + error.message);
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
             {otherUser?.profiles?.avatar_url ? <img src={otherUser.profiles.avatar_url} alt="" className="w-full h-full object-cover" /> : otherUser?.profiles?.display_name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0 font-semibold text-gray-900 truncate">{otherUser?.profiles?.display_name || 'Conversation'}</div>
        {otherUser && (
            <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleCall} className={`p-2 hover:bg-gray-100 rounded-full ${!isUserOnline(otherUser.user_id) ? 'text-gray-400' : 'text-gray-600'}`} aria-label="Call">
                    <Phone size={20} />
                </button>
                <div className={`w-2 h-2 rounded-full shrink-0 ${isUserOnline(otherUser.user_id) ? 'bg-green-500' : 'bg-gray-300'}`} />
            </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 sm:space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.sender_id === user?.id ? 'items-end' : 'items-start'} group`} onClick={() => setSelectedMessageId(selectedMessageId === m.id ? null : m.id)}>
            <div className={`p-3 px-4 rounded-2xl max-w-[88%] sm:max-w-[75%] md:max-w-[65%] break-words ${m.sender_id === user?.id ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-gray-900 rounded-tl-sm border border-gray-100'}`}>
              {editingMessage?.id === m.id ? (
                <div className='flex flex-wrap gap-2 items-center' onClick={e => e.stopPropagation()}>
                    <input
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      autoFocus
                      className='text-black p-2 rounded-lg min-w-0 flex-1 outline-none focus:ring-2 focus:ring-white/50'
                    />
                    <div className="flex gap-2 shrink-0">
                      <button onClick={e => { e.stopPropagation(); updateMessage(); }} className='text-xs bg-white text-blue-600 px-3 py-1.5 rounded-full font-medium'>Save</button>
                      <button onClick={e => { e.stopPropagation(); setEditingMessage(null); }} className='text-xs text-blue-100 px-2 py-1.5'>Cancel</button>
                    </div>
                </div>
              ) : (
                <>
                    {m.content_type === 'voice' ? <VoiceMessage message={m} /> : (m.content_type === 'image' ? <ImageMessage message={m} /> : <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content_body}</span>)}
                    <p className={`text-[10px] mt-1 ${m.sender_id === user?.id ? 'text-blue-100' : 'text-gray-400'}`}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </>
              )}
            </div>
            {m.sender_id === user?.id && !editingMessage && selectedMessageId === m.id && (
                <div className="flex items-center gap-4 mt-1 px-1" onClick={e => e.stopPropagation()}>
                    {m.content_type === 'text' && (
                        <button onClick={e => { e.stopPropagation(); setEditingMessage(m); setEditContent(m.content_body.replace(" (edited)", "")); setSelectedMessageId(null); }} className="text-xs text-blue-600 font-medium hover:text-blue-800 py-1">Edit</button>
                    )}
                    <button onClick={e => { e.stopPropagation(); setMessageToDelete(m); setSelectedMessageId(null); }} className="text-xs text-red-600 font-medium hover:text-red-800 py-1">Delete</button>
                </div>
            )}
          </div>
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
          <img src={previewImage} alt="Preview" className="h-16 w-16 sm:h-20 sm:w-20 rounded object-cover" />
          <button onClick={() => setPreviewImage(null)} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-full hover:bg-gray-100">Cancel</button>
        </div>
      )}
      
      <form onSubmit={sendMessage} className="pb-safe p-2 sm:p-4 bg-white border-t flex gap-1 sm:gap-2 w-full items-center">
        <>
        <VoiceRecorder onSent={() => {}} onAudioPreview={(isPreview) => setIsPreviewMode(isPreview)} />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 hover:bg-gray-100 rounded-full shrink-0 text-gray-500" aria-label="Attach image">
            <ImageIcon size={20} />
        </button>
        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
        {!isPreviewMode && (
          <>
            <input 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
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
