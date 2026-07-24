import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Clock, History } from 'lucide-react';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem('searchHistory');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (!query) { setResults([]); return; }
    
    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);
      
      if (!error && data) {
        setResults(data);
        addToHistory(query);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const addToHistory = (q: string) => {
    const newHistory = [q, ...history.filter(h => h !== q)].slice(0, 5);
    setHistory(newHistory);
    localStorage.setItem('searchHistory', JSON.stringify(newHistory));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Search Users</h1>
      <div className="relative">
        <Search className="absolute left-4 top-4 text-gray-400" size={24} />
        <input 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or @VoiceID..."
          className="w-full p-5 pl-14 border border-gray-200 rounded-3xl focus:ring-4 focus:ring-blue-500/10 outline-none text-lg transition-all"
        />
      </div>

      {!query && history.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2"><History size={16}/> Recent Searches</h2>
          <div className="flex flex-wrap gap-2">
            {history.map(h => (
              <button key={h} onClick={() => setQuery(h)} className="px-4 py-2 bg-gray-100 rounded-full text-gray-700 hover:bg-gray-200 transition">{h}</button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={32}/></div>
      ) : query && results.length === 0 ? (
        <div className="text-center py-20 text-gray-500">No users match your search.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((user) => (
            <div 
              key={user.id} 
              onClick={() => navigate(`/dashboard/profile/${user.id}`)}
              className="flex items-center gap-4 p-5 bg-white border border-gray-100 rounded-3xl cursor-pointer hover:shadow-lg hover:border-gray-200 transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden border border-gray-200">
                {user.avatar_url && <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover"/>}
              </div>
              <div>
                <p className="font-semibold text-lg">{user.display_name}</p>
                <p className="text-blue-600 font-medium">@{user.username}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
