import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Plus, KeyRound, Crown, Compass, Globe2 } from 'lucide-react';
import { useRooms, usePublicRooms, ROOM_CATEGORIES } from '../hooks/useRooms';

export default function RoomsPage() {
  const [tab, setTab] = useState<'mine' | 'explore'>('mine');

  return (
    <div className="max-w-xl mx-auto p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
      </div>

      <div className="flex bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab('mine')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          <Users size={16} /> My Rooms
        </button>
        <button
          onClick={() => setTab('explore')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'explore' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          <Compass size={16} /> Explore
        </button>
      </div>

      {tab === 'mine' ? <MyRooms /> : <Explore />}
    </div>
  );
}

function MyRooms() {
  const { rooms, loading, createRoom, joinByCode } = useRooms();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState<string>(ROOM_CATEGORIES[0]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createRoom(name, description, isPublic, category);
      setShowCreate(false);
      setName('');
      setDescription('');
      setIsPublic(false);
    } catch (err: any) {
      setFeedback(err?.message || 'Room create nahi ho paya.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await joinByCode(code);
      if (result.joined) setFeedback('Room join ho gaya!');
      else if (result.requested) setFeedback(`Request bhej di gayi — "${result.roomName}" ke owner ki approval ka wait karein.`);
      else if (result.alreadyRequested) setFeedback('Aap pehle se request bhej chuke hain.');
      else if (result.alreadyMember) setFeedback('Aap pehle se is room ke member hain.');
      setCode('');
    } catch (err: any) {
      setFeedback(err?.message || 'Room nahi mila. Code check karein.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => { setShowJoin(true); setFeedback(null); }}
          className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
          aria-label="Join by code"
        >
          <KeyRound size={18} />
        </button>
        <button
          onClick={() => { setShowCreate(true); setFeedback(null); }}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
        >
          <Plus size={18} /> New Room
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Loading...</div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Users className="mx-auto mb-3 text-gray-300" size={40} />
          <p>Abhi koi room nahi hai.</p>
          <p className="text-sm">Ek naya room banayein ya code se join karein.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map(room => (
            <Link
              key={room.id}
              to={`/dashboard/rooms/${room.id}`}
              className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-200 transition-colors shadow-sm"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Users size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-gray-900 truncate">{room.name}</span>
                  {room.my_role === 'owner' && <Crown size={14} className="text-amber-500 shrink-0" />}
                  {room.is_public && <Globe2 size={13} className="text-blue-500 shrink-0" />}
                </div>
                <p className="text-sm text-gray-500 truncate">{room.member_count} member{room.member_count !== 1 ? 's' : ''} · Code: {room.room_code}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Naya Room">
          <div className="space-y-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Room ka naam"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={60}
              autoFocus
            />
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              maxLength={200}
            />
            <label className="flex items-center gap-2.5 text-sm text-gray-700">
              <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              Public room — koi bhi turant join kar sakega (Explore me dikhega)
            </label>
            {isPublic && (
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              >
                {ROOM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {feedback && <p className="text-sm text-red-600">{feedback}</p>}
            <button
              onClick={handleCreate}
              disabled={busy || !name.trim()}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {busy ? 'Banaya ja raha hai...' : 'Room Banayein'}
            </button>
          </div>
        </Modal>
      )}

      {showJoin && (
        <Modal onClose={() => setShowJoin(false)} title="Code se Join Karein">
          <div className="space-y-3">
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="Room code (e.g. AB12CD)"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest uppercase"
              maxLength={6}
              autoFocus
            />
            {feedback && <p className="text-sm text-gray-600">{feedback}</p>}
            <button
              onClick={handleJoin}
              disabled={busy || !code.trim()}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {busy ? 'Bhej rahe hain...' : 'Join Karein'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Explore() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const { rooms, loading, fetchPublicRooms } = usePublicRooms(category);
  const { requestToJoin } = useRooms();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (roomId: string) => {
    setError(null);
    setJoiningId(roomId);
    try {
      // Every room shown here is public, so this always comes back joined
      // (no approval step) — see requestToJoin in useRooms.ts.
      const result = await requestToJoin(roomId);
      if (result.joined) navigate(`/dashboard/rooms/${roomId}`);
    } catch (err: any) {
      setError(err?.message || 'Join nahi ho paya.');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCategory(undefined)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${!category ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          All
        </button>
        {ROOM_CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${category === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Loading...</div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Compass className="mx-auto mb-3 text-gray-300" size={40} />
          <p>Is category me abhi koi public room nahi hai.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map(room => {
            const isMember = room.my_status === 'active';
            return (
              <div key={room.id} className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Users size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{room.name}</p>
                    <p className="text-xs text-gray-500">
                      {room.category && <span className="text-blue-600">{room.category}</span>} · by {room.owner_name} · {room.member_count} member{room.member_count !== 1 ? 's' : ''}
                    </p>
                    {room.description && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{room.description}</p>}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  {isMember ? (
                    <Link to={`/dashboard/rooms/${room.id}`} className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">
                      Open
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleJoin(room.id)}
                      disabled={joiningId === room.id}
                      className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                    >
                      {joiningId === room.id ? 'Join ho raha hai...' : 'Join'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button onClick={() => fetchPublicRooms()} className="text-xs text-gray-400 mx-auto block">Refresh</button>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {children}
      </div>
    </div>
  );
      }
