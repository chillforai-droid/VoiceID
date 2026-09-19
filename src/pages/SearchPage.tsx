import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, History, Users, Hash, MessageCircle, Mic2, ArrowRight, X } from 'lucide-react';
import { usePublicRooms } from '../hooks/useRooms';

type SearchTab = 'all' | 'users' | 'rooms';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [tab, setTab] = useState<SearchTab>('all');
  const navigate = useNavigate();
  const { rooms: publicRooms, loading: loadingRooms } = usePublicRooms();
  const rooms = submittedQuery.trim()
    ? publicRooms.filter((room: any) => {
        const q = submittedQuery.trim().toLowerCase();
        return `${room.name} ${room.description || ''} ${room.category || ''} ${room.owner_name || ''}`.toLowerCase().includes(q);
      })
    : publicRooms;

  useEffect(() => {
    const saved = localStorage.getItem('searchHistory');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch { setHistory([]); }
    }
  }, []);

  useEffect(() => {
    const q = submittedQuery.trim();
    if (!q) { setResults([]); return; }
    let cancelled = false;
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const safe = q.replace(/[%(),]/g, ' ').trim();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
        .limit(20);
      if (!cancelled && !error) setResults(data || []);
      if (!cancelled) setLoadingUsers(false);
    };
    fetchUsers();
    return () => { cancelled = true; };
  }, [submittedQuery]);

  const addToHistory = (q: string) => {
    const value = q.trim();
    if (!value) return;
    const next = [value, ...history.filter(h => h.toLowerCase() !== value.toLowerCase())].slice(0, 5);
    setHistory(next);
    localStorage.setItem('searchHistory', JSON.stringify(next));
  };

  const runSearch = (value = query) => {
    const q = value.trim();
    setQuery(q);
    setSubmittedQuery(q);
    if (q) addToHistory(q);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('searchHistory');
  };

  const quickFilters = [
    { label: 'Trending', icon: '🔥', value: 'trending' },
    { label: 'Music', icon: '♫', value: 'music' },
    { label: 'Gaming', icon: '🎮', value: 'gaming' },
    { label: 'Study', icon: '📖', value: 'study' },
    { label: 'Spiritual', icon: '🪷', value: 'spiritual' },
    { label: 'Tech', icon: '⚙', value: 'tech' },
  ];

  const showUsers = tab === 'all' || tab === 'users';
  const showRooms = tab === 'all' || tab === 'rooms';

  return (
    <div className="min-h-full bg-[#f7f8ff] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-sky-100 via-indigo-100 to-fuchsia-100 p-5 sm:p-7">
          <div className="absolute -right-10 -top-20 h-56 w-56 rounded-full bg-fuchsia-300/40 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-600">VoiceID Explore</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Search People, Rooms & More</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">Find friends, public rooms, creators and conversations in the VoiceID community.</p>
          </div>
        </section>

        <form onSubmit={e => { e.preventDefault(); runSearch(); }} className="relative flex gap-2 rounded-full bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
          <Search className="ml-4 mt-3 shrink-0 text-slate-400" size={24} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search users, rooms, topics or @username..." className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base outline-none placeholder:text-slate-400" />
          {query && <button type="button" onClick={() => { setQuery(''); setSubmittedQuery(''); }} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>}
          <button type="submit" className="rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 font-bold text-white">Search</button>
        </form>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            ['all', 'All', Search],
            ['users', 'Users', Users],
            ['rooms', 'Rooms', MessageCircle],
          ] as const).map(([value, label, Icon]) => (
            <button key={value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold ${tab === value ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white' : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200'}`}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>

        {!submittedQuery && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-950">Quick Filters</h2>
              <span className="text-sm font-semibold text-slate-500">Explore topics</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {quickFilters.map(f => (
                <button key={f.label} onClick={() => runSearch(f.value)} className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5">
                  <div className="text-2xl">{f.icon}</div><div className="mt-1 text-xs font-semibold text-slate-700">{f.label}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {showUsers && submittedQuery && (
          <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold text-slate-950">People</h2><span className="text-xs text-slate-400">{results.length} results</span></div>
            {loadingUsers ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-600" /></div> : results.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No users found.</p> : <div className="grid gap-2 sm:grid-cols-2">{results.map(user => <button key={user.id} onClick={() => navigate(`/dashboard/profile/${user.id}`)} className="flex items-center gap-3 rounded-2xl p-3 text-left hover:bg-slate-50"><div className="h-12 w-12 overflow-hidden rounded-full bg-indigo-100">{user.avatar_url ? <img src={user.avatar_url} alt={user.display_name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-bold text-indigo-600">{(user.display_name || 'V').slice(0,1).toUpperCase()}</div>}</div><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-900">{user.display_name || 'VoiceID User'}</p><p className="truncate text-sm text-indigo-600">@{user.username}</p></div><ArrowRight size={18} className="text-slate-300" /></button>)}</div>}
          </section>
        )}

        {showRooms && submittedQuery && (
          <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold text-slate-950">Public Rooms</h2><span className="text-xs text-slate-400">{rooms.length} rooms</span></div>
            {loadingRooms ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-600" /></div> : rooms.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No public rooms found.</p> : <div className="grid gap-3 sm:grid-cols-2">{rooms.map((room: any) => <div key={room.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white">{room.cover_url ? <img src={room.cover_url} alt="" className="h-full w-full object-cover" /> : <Mic2 size={24} />}</div><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-900">{room.name}</p><p className="truncate text-xs text-slate-500">{room.category || 'Public room'} · {room.member_count || 0} online</p></div><button onClick={() => navigate(`/dashboard/rooms/${room.id}`)} className="rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white">Join</button></div>)}</div>}
          </section>
        )}

        {!submittedQuery && history.length > 0 && (
          <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400"><History size={16}/> Recent Searches</h2><button onClick={clearHistory} className="text-xs font-semibold text-indigo-600">Clear All</button></div>
            <div className="flex flex-wrap gap-2">{history.map(h => <button key={h} onClick={() => runSearch(h)} className="rounded-full bg-slate-50 px-4 py-2 text-sm text-slate-700 ring-1 ring-slate-200">{h}</button>)}</div>
          </section>
        )}
      </div>
    </div>
  );
}
