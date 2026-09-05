import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, KeyRound, Crown } from 'lucide-react';
import { useRooms } from '../hooks/useRooms';

export default function RoomsPage() {
  const { rooms, loading, createRoom, joinByCode } = useRooms();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createRoom(name, description);
      setShowCreate(false);
      setName('');
      setDescription('');
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
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
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
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
          >
            <Plus size={18} /> New Room
          </button>
        </div>
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}
