import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Camera, Shield, ShieldOff, VolumeX, Volume2, UserMinus, Ban, Crown, Users, Eye, MessageSquare, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useRooms, useRoomModeration, CREATOR_ROOM_CATEGORIES, ROOM_CATEGORIES } from '../hooks/useRooms';
import { uploadImageToCloudinary } from '../lib/uploadImageToCloudinary';

export default function RoomManagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { updateRoomSettings } = useRooms();
  const { members, stats, loading, setMuted, removeMember, banMember, setModerator } = useRoomModeration(id);
  const [room, setRoom] = useState<any>(null);
  const [tab, setTab] = useState<'profile' | 'members' | 'stats'>('profile');

  useEffect(() => {
    if (!id) return;
    supabase.from('rooms').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) console.error('Failed to load room:', error);
      setRoom(data);
    });
  }, [id]);

  const isOwner = room && user && room.owner_id === user.id;
  const isModerator = members.some(m => m.user_id === user?.id && (m.role === 'owner' || m.role === 'moderator'));

  if (!id) return null;

  if (room && !isOwner && !isModerator) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center text-gray-500">
        <Shield className="mx-auto mb-3 text-gray-300" size={36} />
        <p>Is room ko manage karne ki permission nahi hai.</p>
        <Link to={`/dashboard/rooms/${id}`} className="text-blue-600 text-sm mt-2 inline-block">Room par wapas jayein</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100">
        <button onClick={() => navigate(`/dashboard/rooms/${id}`)} className="text-gray-600" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-gray-900 truncate flex-1">{room?.name || 'Manage Room'}</h1>
      </div>

      <div className="flex bg-gray-100 rounded-xl p-1 m-4">
        {isOwner && (
          <button onClick={() => setTab('profile')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'profile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            Profile
          </button>
        )}
        <button onClick={() => setTab('members')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'members' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Members
        </button>
        <button onClick={() => setTab('stats')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'stats' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Stats
        </button>
      </div>

      <div className="px-4">
        {tab === 'profile' && isOwner && room && (
          <ProfileTab room={room} onSaved={setRoom} updateRoomSettings={updateRoomSettings} />
        )}

        {tab === 'members' && (
          <div className="space-y-2">
            {loading ? (
              <p className="text-center text-gray-400 py-8">Loading...</p>
            ) : members.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Koi member nahi mila.</p>
            ) : members.map(m => (
              <div key={m.member_row_id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl">
                {m.avatar_url ? (
                  <img src={m.avatar_url} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">
                    {(m.display_name || m.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900 truncate">{m.display_name || m.username}</span>
                    {m.role === 'owner' && <Crown size={13} className="text-amber-500 shrink-0" />}
                    {m.role === 'moderator' && <Shield size={13} className="text-blue-500 shrink-0" />}
                    {m.is_muted && <VolumeX size={13} className="text-gray-400 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-400">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                </div>
                {m.role !== 'owner' && (
                  <div className="flex items-center gap-1 shrink-0">
                    {isOwner && (
                      <button
                        onClick={() => setModerator(m.member_row_id, m.role !== 'moderator')}
                        className="p-2 text-gray-400 hover:text-blue-600"
                        aria-label={m.role === 'moderator' ? 'Remove moderator' : 'Make moderator'}
                        title={m.role === 'moderator' ? 'Remove moderator' : 'Make moderator'}
                      >
                        {m.role === 'moderator' ? <ShieldOff size={17} /> : <Shield size={17} />}
                      </button>
                    )}
                    <button
                      onClick={() => setMuted(m.member_row_id, !m.is_muted)}
                      className="p-2 text-gray-400 hover:text-amber-600"
                      aria-label={m.is_muted ? 'Unmute' : 'Mute'}
                      title={m.is_muted ? 'Unmute' : 'Mute'}
                    >
                      {m.is_muted ? <Volume2 size={17} /> : <VolumeX size={17} />}
                    </button>
                    <button
                      onClick={() => { if (window.confirm(`${m.display_name || m.username} ko room se hatayein?`)) removeMember(m.member_row_id); }}
                      className="p-2 text-gray-400 hover:text-orange-600"
                      aria-label="Remove"
                      title="Remove"
                    >
                      <UserMinus size={17} />
                    </button>
                    <button
                      onClick={() => { if (window.confirm(`${m.display_name || m.username} ko ban karein? Yeh dobara join nahi kar payenge.`)) banMember(m.member_row_id); }}
                      className="p-2 text-gray-400 hover:text-red-600"
                      aria-label="Ban"
                      title="Ban"
                    >
                      <Ban size={17} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'stats' && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Users size={18} />} label="Total Members" value={stats?.total_members} />
            <StatCard icon={<TrendingUp size={18} />} label="New (7d)" value={stats?.new_members_7d} />
            <StatCard icon={<MessageSquare size={18} />} label="Messages" value={stats?.total_messages} />
            <StatCard icon={<MessageSquare size={18} />} label="Messages (7d)" value={stats?.messages_7d} />
            <StatCard icon={<Eye size={18} />} label="Room Views" value={stats?.room_views} />
            <StatCard icon={<Users size={18} />} label="Active (7d)" value={stats?.active_members_7d} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
  return (
    <div className="p-4 bg-white border border-gray-100 rounded-xl">
      <div className="text-blue-600 mb-2">{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function ProfileTab({ room, onSaved, updateRoomSettings }: {
  room: any;
  onSaved: (room: any) => void;
  updateRoomSettings: (roomId: string, settings: any) => Promise<void>;
}) {
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description || '');
  const [category, setCategory] = useState(room.category || '');
  const [isPublic, setIsPublic] = useState(room.is_public);
  const [rules, setRules] = useState(room.rules || '');
  const [creatorDisplayName, setCreatorDisplayName] = useState(room.creator_display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(room.avatar_url || '');
  const [coverUrl, setCoverUrl] = useState(room.cover_url || '');
  const [busy, setBusy] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isCreator = room.room_type === 'creator';
  const categories = isCreator ? CREATOR_ROOM_CATEGORIES : ROOM_CATEGORIES;

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const setUploading = kind === 'avatar' ? setUploadingAvatar : setUploadingCover;
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(file, 'voiceid/rooms', `${room.id}-${kind}`);
      if (kind === 'avatar') setAvatarUrl(url); else setCoverUrl(url);
    } catch (err) {
      console.error(`Failed to upload room ${kind}:`, err);
      setMessage(`${kind === 'avatar' ? 'Avatar' : 'Cover'} upload nahi ho paya.`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const settings = {
        name: name.trim(), description: description.trim() || null, category: category || null,
        is_public: isPublic, rules: rules.trim() || null,
        creator_display_name: creatorDisplayName.trim() || null,
        avatar_url: avatarUrl || null, cover_url: coverUrl || null,
      };
      await updateRoomSettings(room.id, settings);
      onSaved({ ...room, ...settings });
      setMessage('Save ho gaya!');
    } catch (err: any) {
      setMessage(err?.message || 'Save nahi ho paya.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {isCreator && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Cover Image</label>
          <label className="block aspect-[3/1] bg-gray-100 rounded-xl overflow-hidden relative cursor-pointer">
            {coverUrl && <img src={coverUrl} className="w-full h-full object-cover" alt="" />}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
              {uploadingCover ? <span className="text-xs">Uploading...</span> : <Camera size={20} />}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={e => handleImagePick(e, 'cover')} />
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden relative cursor-pointer shrink-0">
          {avatarUrl && <img src={avatarUrl} className="w-full h-full object-cover" alt="" />}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
            {uploadingAvatar ? <span className="text-[9px]">...</span> : <Camera size={16} />}
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={e => handleImagePick(e, 'avatar')} />
        </label>
        <p className="text-xs text-gray-500">Room {isCreator ? 'logo' : 'avatar'}</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Room Name</label>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={60} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={300} rows={3} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {isCreator && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Creator Display Name</label>
          <input value={creatorDisplayName} onChange={e => setCreatorDisplayName(e.target.value)} maxLength={60} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">—</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Room Rules (optional)</label>
        <textarea value={rules} onChange={e => setRules(e.target.value)} maxLength={500} rows={3} placeholder="Members ke liye guidelines..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <label className="flex items-center gap-2.5 text-sm text-gray-700">
        <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="w-4 h-4 accent-blue-600" />
        Public room — koi bhi Explore/Creator Rooms me dhundh kar join kar sake
      </label>

      {message && <p className={`text-sm ${message.includes('nahi') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}

      <button
        onClick={handleSave}
        disabled={busy || !name.trim()}
        className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50"
      >
        {busy ? 'Save ho raha hai...' : 'Changes Save Karein'}
      </button>
    </div>
  );
}
