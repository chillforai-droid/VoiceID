import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Send, Loader2 } from 'lucide-react';
import { VoiceRecorder } from '../components/chat/VoiceRecorder';
import { VoiceMessage } from '../components/chat/VoiceMessage';

export default function ChatPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading || !id || !user) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(display_name)')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (!error && data) setMessages(data);
      setMessagesLoading(false);
    };

    fetchMessages();

    const subscription = supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, [id, user, authLoading]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !id) return;

    const { error } = await supabase.from('messages').insert({
      conversation_id: id,
      sender_id: user?.id,
      content_body: newMessage,
      content_type: 'text'
    });
    
    if (error) {
        console.error('Message insert error:', error);
        alert(`Failed to save message: ${error.message}`);
    } else {
        setNewMessage('');
    }
  };

  if (authLoading || messagesLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!user) return <div className="p-20 text-center">Please sign in to chat.</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-2xl max-w-[80%] ${m.sender_id === user?.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
              {m.content_type === 'voice' ? <VoiceMessage message={m} /> : m.content_body}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
      <form onSubmit={sendMessage} className="p-4 border-t flex gap-2 w-full items-center">
        <VoiceRecorder onSent={() => {}} onAudioPreview={(isPreview) => setIsPreviewMode(isPreview)} />
        {!isPreviewMode && (
          <>
            <input 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 p-3 border rounded-full outline-none min-w-0"
              placeholder="Type a message..."
            />
            <button type="submit" className="p-3 bg-blue-600 text-white rounded-full flex-shrink-0"><Send size={20} /></button>
          </>
        )}
      </form>
    </div>
  );
}
