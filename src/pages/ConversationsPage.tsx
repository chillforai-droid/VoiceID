import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Loader2 } from 'lucide-react';

export default function ConversationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }

    const fetchConversations = async () => {
      // 1. Get IDs of conversations the user is a member of
      const { data: memberships, error: membershipsError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user?.id);

      if (membershipsError || !memberships) {
        setLoading(false);
        return;
      }

      const convIds = memberships.map((m) => m.conversation_id);

      // 2. Fetch conversations and all their members
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          last_message_at,
          conversation_members(user_id, profiles(display_name, avatar_url)),
          messages(content_body, created_at, message_type)
        `)
        .in('id', convIds)
        .order('last_message_at', { ascending: false });

      if (!error && data) {
        setConversations(data);
      }
      setLoading(false);
    };

    fetchConversations();
    
    // Real-time
    const subscription = supabase
      .channel('conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, fetchConversations)
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, [user, authLoading]);

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold mb-6">Conversations</h1>
      {conversations.length === 0 ? (
        <div className="text-center py-20 text-gray-500">No conversations yet.</div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => {
            const otherMember = conv.conversation_members.find((m: any) => m.user_id !== user?.id)?.profiles;
            const latestMessage = conv.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            return (
              <div 
                key={conv.id} 
                onClick={() => navigate(`/dashboard/chat/${conv.id}`)}
                className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl cursor-pointer hover:shadow-sm transition"
              >
                <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden">
                    {otherMember?.avatar_url && <img src={otherMember.avatar_url} alt={otherMember.display_name} className="w-full h-full object-cover"/>}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{otherMember?.display_name || 'Unknown'}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {latestMessage?.message_type === 'voice' ? 'Voice message' : (latestMessage?.content_body || 'No messages')}
                  </p>
                </div>
                <p className="text-xs text-gray-400">{new Date(conv.last_message_at).toLocaleTimeString()}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
