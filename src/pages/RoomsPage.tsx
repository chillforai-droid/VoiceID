import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Plus, KeyRound, Crown, Compass, Globe2, Star, Search, Camera, Shield } from 'lucide-react';
import { useRooms, usePublicRooms, useCreatorRooms, ROOM_CATEGORIES, CREATOR_ROOM_CATEGORIES } from '../hooks/useRooms';
import { uploadImageToCloudinary } from '../lib/uploadImageToCloudinary';
import CreatorBadge from '../components/room/CreatorBadge';

export default function RoomsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sharedCode = searchParams.get('code');
  const [tab, setTab] = useState<'mine' | 'explore' | 'creators'>('mine');

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
        <button
          onClick={() => setTab('creators')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'creators' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          <Star size={16} /> Creators
        </button>
      </div>

      {tab === 'mine' && (
        <MyRooms
          initialJoinCode={sharedCode || undefined}
          onConsumedInitialCode={() => { searchParams.delete('code'); setSearchParams(searchParams, { replace: true }); }}
        />
      )}
      {tab === 'explore' && <Explore />}
      {tab === 'creators' && <CreatorRoomsTab />}
    </div>
  );
}

function MyRooms({ initialJoinCode, onConsumedInitialCode }: { initialJoinCode?: string; onConsumedInitialCode?: () => void }) {
  const navigate = useNavigate();
  const { rooms, loading, createRoom, joinByCode } = useRooms();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [roomType, setRoomType] = useState<'normal' | 'creator'>('normal');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [creatorDisplayName, setCreatorDisplayName] = useState('');
  const [rules, setRules] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // A shared room link (voiceid.online/dashboard/rooms?code=XXXXXX) lands
  // here — open the join modal pre-filled instead of making the person
  // type the code back in by hand.
  useEffect(() => {
    if (!initialJoinCode) return;
    setCode(initialJoinCode.toUpperCase());
    setShowJoin(true);
    onConsumedInitialCode?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJoinCode]);

  const isCreator = roomType === 'creator';
  const categoryOptions = isCreator ? CREATOR_ROOM_CATEGORIES : ROOM_CATEGORIES;

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const setUploading = kind === 'avatar' ? setUploadingAvatar : setUploadingCover;
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(file, 'voiceid/rooms', `${crypto.randomUUID()}-${kind}`);
      if (kind === 'avatar') setAvatarUrl(url); else setCoverUrl(url);
    } catch (err) {
      console.error(`Failed to upload room ${kind}:`, err);
      setFeedback(`${kind === 'avatar' ? 'Avatar' : 'Cover'} upload nahi ho paya.`);
    } finally {
      setUploading(false);
    }
  };

  const resetCreateForm = () => {
    setName(''); setDescription(''); setIsPublic(false); setCategory('');
    setCreatorDisplayName(''); setRules(''); setAvatarUrl(''); setCoverUrl(''); setRoomType('normal');
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const room = await createRoom(name, description, isPublic, category, isCreator ? {
        roomType: 'creator', avatarUrl: avatarUrl || null, coverUrl: coverUrl || null,
        rules, creatorDisplayName,
      } : undefined);
      setShowCreate(false);
      resetCreateForm();
      if (isCreator && room?.id) navigate(`/dashboard/rooms/${room.id}/manage`);
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
      else if (result.banned) setFeedback('Is room se aapko ban kiya gaya hai.');
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
              {room.avatar_url ? (
                <img src={room.avatar_url} className="w-12 h-12 rounded-xl object-cover shrink-0" alt="" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Users size={22} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-gray-900 truncate">{room.name}</span>
                  {room.my_role === 'owner' && <Crown size={14} className="text-amber-500 shrink-0" />}
                  {room.my_role === 'moderator' && <Shield size={13} className="text-blue-500 shrink-0" />}
                  {room.is_public && <Globe2 size={13} className="text-blue-500 shrink-0" />}
                  {room.room_type === 'creator' && <CreatorBadge />}
                </div>
                <p className="text-sm text-gray-500 truncate">{room.member_count} member{room.member_count !== 1 ? 's' : ''} · Code: {room.room_code}</p>
              </div>
              {room.my_role === 'owner' && (
                <span
                  role="button"
                  onClick={e => { e.preventDefault(); navigate(`/dashboard/rooms/${room.id}/manage`); }}
                  className="p-2 text-gray-400 hover:text-blue-600 shrink-0"
                  aria-label="Manage room"
                >
                  <Shield size={18} />
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal onClose={() => { setShowCreate(false); resetCreateForm(); }} title="Naya Room">
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-0.5">
            <div className="flex bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setRoomType('normal')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${roomType === 'normal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                Normal Room
              </button>
              <button
                onClick={() => setRoomType('creator')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 ${roomType === 'creator' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                <Star size={13} /> Creator Room
              </button>
            </div>

            {isCreator && (
              <>
                <label className="block aspect-[3/1] bg-gray-100 rounded-xl overflow-hidden relative cursor-pointer">
                  {coverUrl && <img src={coverUrl} className="w-full h-full object-cover" alt="" />}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 text-gray-600">
                    <Camera size={18} />
                    <span className="text-[10px]">{uploadingCover ? 'Uploading...' : 'Cover image'}</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleImagePick(e, 'cover')} />
                </label>
                <div className="flex items-center gap-3">
                  <label className="w-14 h-14 rounded-full bg-gray-100 overflow-hidden relative cursor-pointer shrink-0">
                    {avatarUrl && <img src={avatarUrl} className="w-full h-full object-cover" alt="" />}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 text-gray-600">
                      <Camera size={14} />
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImagePick(e, 'avatar')} />
                  </label>
                  <span className="text-xs text-gray-500">{uploadingAvatar ? 'Uploading...' : 'Room logo/avatar'}</span>
                </div>
              </>
            )}

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

            {isCreator && (
              <input
                value={creatorDisplayName}
                onChange={e => setCreatorDisplayName(e.target.value)}
                placeholder="Creator display name (optional)"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={60}
              />
            )}

            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
            >
              <option value="">Category chunein</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {isCreator && (
              <textarea
                value={rules}
                onChange={e => setRules(e.target.value)}
                placeholder="Room rules (optional)"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
                maxLength={500}
              />
            )}

            <label className="flex items-center gap-2.5 text-sm text-gray-700">
              <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              Public room — koi bhi turant join kar sakega (Explore me dikhega)
            </label>

            {feedback && <p className="text-sm text-red-600">{feedback}</p>}
            <button
              onClick={handleCreate}
              disabled={busy || !name.trim() || uploadingAvatar || uploadingCover}
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

function CreatorRoomsTab() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const { rooms, loading } = useCreatorRooms(category, search);
  const { requestToJoin } = useRooms();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleJoinOrOpen = async (roomId: string, myStatus: string | null) => {
    if (myStatus === 'active') { navigate(`/dashboard/rooms/${roomId}`); return; }
    setError(null);
    setJoiningId(roomId);
    try {
      const result = await requestToJoin(roomId);
      if (result.joined) navigate(`/dashboard/rooms/${roomId}`);
      else setError('Request bhej di gayi — owner ki approval ka wait karein.');
    } catch (err: any) {
      setError(err?.message || 'Join nahi ho paya.');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); }} className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Creator rooms search karein..."
          className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCategory(undefined)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${!category ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          All
        </button>
        {CREATOR_ROOM_CATEGORIES.map(c => (
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
          <Star className="mx-auto mb-3 text-gray-300" size={40} />
          <p>Abhi koi Creator Room upalabdh nahi hai.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map(room => (
            <div key={room.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="h-20 bg-gradient-to-r from-indigo-500 to-purple-500 relative">
                {room.cover_url && <img src={room.cover_url} className="w-full h-full object-cover" alt="" />}
                {room.is_featured && (
                  <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-amber-400 text-amber-900 text-[10px] font-bold rounded-full">
                    <Star size={10} fill="currentColor" /> Featured
                  </span>
                )}
              </div>
              <div className="p-4 pt-0 -mt-6 flex items-end gap-3">
                {room.avatar_url ? (
                  <img src={room.avatar_url} className="w-14 h-14 rounded-xl object-cover ring-4 ring-white shrink-0" alt="" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center ring-4 ring-white shrink-0">
                    <Users size={22} />
                  </div>
                )}
                <div className="flex-1 min-w-0 pb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-gray-900 truncate">{room.name}</span>
                    <CreatorBadge />
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {room.creator_display_name || room.owner_name} · {room.member_count} member{room.member_count !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              {room.description && <p className="px-4 text-sm text-gray-600 line-clamp-2 mb-3">{room.description}</p>}
              <div className="px-4 pb-4 flex justify-end">
                <button
                  onClick={() => handleJoinOrOpen(room.id, room.my_status)}
                  disabled={joiningId === room.id}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                >
                  {joiningId === room.id ? '...' : room.my_status === 'active' ? 'Open' : 'Join'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
