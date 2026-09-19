import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Loader2, Search, Plus, ChevronRight, MoreHorizontal } from 'lucide-react';

export default function ConversationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { notifications, unreadMessageCount } = useNotifications();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const refetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    const fetchConversations = async () => {
      const { data: memberships, error: membershipsFetchError } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', user.id);
      if (membershipsError(membershipsFetchError, memberships)) { setLoading(false); return; }
      const convIds = (memberships || []).map((m: any) => m.conversation_id);
      if (!convIds.length) { setConversations([]); setLoading(false); return; }
      const { data, error } = await supabase.from('conversations').select('id,last_message_at,conversation_members(user_id,profiles(display_name,avatar_url,is_ai)),messages(content_body,created_at,content_type)').in('id', convIds).order('last_message_at', { ascending: false });
      if (!error && data) setConversations(data);
      setLoading(false);
    };
    const scheduleRefetch = () => { if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current); refetchTimeoutRef.current = setTimeout(fetchConversations, 180); };
    fetchConversations();
    const a = supabase.channel('conversations').on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, scheduleRefetch).subscribe();
    const b = supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, scheduleRefetch).subscribe();
    return () => { if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current); supabase.removeChannel(a); supabase.removeChannel(b); };
  }, [user, authLoading]);

  const rows = conversations.map(conv => {
    const other = conv.conversation_members?.find((m: any) => m.user_id !== user?.id)?.profiles;
    const latest = [...(conv.messages || [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const unread = notifications.filter(n => n.type === 'message' && n.related_id === conv.id && !n.is_read).length;
    return { ...conv, other, latest, unread };
  }).filter(row => {
    const q = search.trim().toLowerCase();
    const matches = !q || (row.other?.display_name || 'Unknown').toLowerCase().includes(q);
    return matches && (filter === 'all' || row.unread > 0);
  });

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-600" size={32}/></div>;

  return (
    <div className="min-h-full bg-[#f7f8ff] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div><h1 className="text-3xl font-extrabold tracking-tight text-slate-950">Messages</h1><p className="mt-1 text-slate-500">Chat, share and stay connected</p></div>
          <button onClick={() => navigate('/dashboard/search')} className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 font-bold text-white shadow-lg"><Plus size={20}/> New Chat</button>
        </div>
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200"><Search className="text-slate-400" size={22}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search messages or users..." className="w-full bg-transparent outline-none placeholder:text-slate-400"/></div>
        <div className="flex gap-2 overflow-x-auto"><button onClick={() => setFilter('all')} className={`rounded-full px-6 py-2.5 text-sm font-bold ${filter === 'all' ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>All {unreadMessageCount > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">{unreadMessageCount}</span>}</button><button onClick={() => setFilter('unread')} className={`rounded-full px-6 py-2.5 text-sm font-bold ${filter === 'unread' ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>Unread</button><span className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-500">Friends</span><span className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-500">Groups</span></div>
        {rows.length === 0 ? <div className="rounded-3xl bg-white p-16 text-center shadow-sm ring-1 ring-slate-100"><MessageSquare className="mx-auto mb-4 text-indigo-200" size={52}/><p className="font-bold text-slate-900">No conversations yet</p><p className="mt-1 text-sm text-slate-500">Start chatting with friends from Search.</p></div> : <div className="space-y-2">{rows.map(row => { const name = row.other?.display_name || 'Unknown'; return <button key={row.id} onClick={() => navigate(`/dashboard/chat/${row.id}`)} className="group flex w-full items-center gap-3 rounded-3xl bg-white p-3.5 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md"><div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-100 to-violet-100">{row.other?.avatar_url ? <img src={row.other.avatar_url} alt={name} className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center text-lg font-bold text-indigo-600">{name.slice(0,1).toUpperCase()}</div>}<span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500"/></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-extrabold text-slate-950">{name}</p>{row.other?.is_ai && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">AI</span>}</div><p className="truncate text-sm text-slate-500">{row.latest?.content_type === 'voice' ? '🎙 Voice message' : (row.latest?.content_body || 'No messages')}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><span className="text-xs text-slate-400">{row.last_message_at ? new Date(row.last_message_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</span>{row.unread > 0 ? <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-1.5 text-[10px] font-bold text-white">{row.unread}</span> : <ChevronRight size={19} className="text-slate-300"/>}</div><MoreHorizontal size={17} className="hidden text-slate-300 sm:block"/></button>})}</div>}
      </div>
    </div>
  );
}

function membershipsError(error: any, memberships: any) { return Boolean(error || !memberships); }
