import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Phone, Video, MessageCircle, UserPlus, Loader2, UserCheck, UserX, Ban, Share, Copy, Check, LogIn, UserRoundPlus, Link2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useVoiceCall } from '../hooks/useVoiceCall';
import { usePresence } from '../context/PresenceContext';
import { useSEO } from '../hooks/useSEO';

export default function UserProfilePage() {
  const { id, username } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { initiateCall, canCallUser } = useVoiceCall();
  const { isUserOnline } = usePresence();
  const [profile, setProfile] = useState<any>(null);
  const [contactRelation, setContactRelation] = useState<{ status: string | null, isIncoming: boolean }>({ status: null, isIncoming: false });
  const [profileLoading, setProfileLoading] = useState(true);
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const navigate = useNavigate();

  useSEO({
      title: profile ? `${profile.display_name} (@${profile.username}) | VoiceID` : 'VoiceID Profile',
      description: profile ? `Connect with @${profile.username} on VoiceID.` : 'VoiceID Profile',
      canonical: profile ? `https://voiceid.online/u/${profile.username}` : `https://voiceid.online/`,
      robots: profile ? 'index, follow' : 'noindex, follow',
      jsonLd: profile ? [{
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        dateCreated: profile.created_at || undefined,
        mainEntity: {
          '@type': 'Person',
          name: profile.display_name,
          alternateName: profile.username,
          url: `https://voiceid.online/u/${profile.username}`,
          image: profile.avatar_url || undefined,
        },
      }] : undefined,
  });

  useEffect(() => {
    if (authLoading) return;
    const resolveId = async () => {
        if (id) {
            setResolvedProfileId(id === 'me' ? user?.id || null : id);
        } else if (username) {
            const { data } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
            setResolvedProfileId(data?.id || null);
        }
        setProfileLoading(false);
    };
    resolveId();
  }, [id, username, authLoading, user]);

  const isOnline = resolvedProfileId ? isUserOnline(resolvedProfileId) : false;

  useEffect(() => {
    if (authLoading || !resolvedProfileId) return;
    const fetchData = async () => {
      setProfileLoading(true);
      const { data: profileData, error } = await supabase.from('profiles').select('*').eq('id', resolvedProfileId).maybeSingle();
      if (error) console.error("PROFILE FETCH ERROR:", error);
      setProfile(profileData);

      // Remember the shared profile so signup/login can return the visitor to it.
      if (!user && profileData?.username) {
        window.localStorage.setItem('voiceid_shared_profile_ref', profileData.username);
      }
      
      if (user && resolvedProfileId && user.id !== resolvedProfileId) {
        const { data: contacts } = await supabase
            .from('contacts')
            .select('status, requester_id, responder_id')
            .or(`and(requester_id.eq.${user?.id},responder_id.eq.${resolvedProfileId}),and(requester_id.eq.${resolvedProfileId},responder_id.eq.${user?.id})`);
            
        if (contacts && contacts.length > 0) {
            const bestContact = contacts.sort((a, b) => {
                const priority = { 'accepted': 3, 'pending': 2, 'blocked': 1 };
                return (priority[b.status as keyof typeof priority] || 0) - (priority[a.status as keyof typeof priority] || 0);
            })[0];
            
            setContactRelation({
                status: bestContact.status,
                isIncoming: bestContact.responder_id === user?.id
            });
        } else {
            setContactRelation({ status: null, isIncoming: false });
        }
      }
      setProfileLoading(false);
    };
    fetchData();
  }, [resolvedProfileId, user, authLoading]);

  const handleCall = async () => {
      const { canCall, reason } = await canCallUser(resolvedProfileId!);
      if (!canCall) {
          alert(reason);
      } else {
          initiateCall(resolvedProfileId!, 'voice');
      }
  };

  const handleVideoCall = async () => {
      const { canCall, reason } = await canCallUser(resolvedProfileId!);
      if (!canCall) {
          alert(reason);
      } else {
          initiateCall(resolvedProfileId!, 'video');
      }
  };

  const getProfileShareUrl = () => `${window.location.origin}/u/${encodeURIComponent(profile.username)}?ref=${encodeURIComponent(profile.username)}`;

  const getProfileShareText = () => {
    const details = [
      `${profile.display_name} on VoiceID`,
      `VoiceID: @${profile.username}`,
      profile.bio ? `About: ${profile.bio}` : '',
      `Connect with ${profile.display_name} securely on VoiceID.`,
      getProfileShareUrl(),
    ].filter(Boolean);
    return details.join('\n');
  };

  const handleShare = async () => {
    if (!profile) return;
    const profileUrl = getProfileShareUrl();
    const text = getProfileShareText();
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${profile.display_name} | VoiceID`,
          text,
          url: profileUrl,
        });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      }
    } catch (err: any) {
      // Browser share cancellation is normal; fall back to clipboard for other failures.
      if (err?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2200);
        } catch (copyErr) {
          console.error('Error sharing profile:', copyErr);
        }
      }
    } finally {
      setSharing(false);
    }
  };

  const handleCopyProfile = async () => {
    try {
      await navigator.clipboard.writeText(getProfileShareText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.error('Could not copy profile:', err);
    }
  };

  const handleContactAction = async (action: 'add' | 'accept' | 'reject' | 'remove' | 'block' | 'unblock') => {
    if (!user || user.id === resolvedProfileId) return;
    
    let error;
    let rowsAffected: any[] | null = null;
    if (action === 'add') {
        const { error: err } = await supabase.from('contacts').insert({ requester_id: user?.id, responder_id: resolvedProfileId, status: 'pending' });
        error = err;
    } else if (action === 'remove' || action === 'reject') {
        // .select() forces the delete to report back which rows it actually
        // removed. Without it, a delete blocked by RLS (0 rows affected)
        // still returns error: null, making a no-op look successful.
        const { data, error: err } = await supabase.from('contacts').delete().or(`and(requester_id.eq.${user?.id},responder_id.eq.${resolvedProfileId}),and(requester_id.eq.${resolvedProfileId},responder_id.eq.${user?.id})`).select();
        error = err;
        rowsAffected = data;
    } else if (action === 'accept') {
        const { error: err } = await supabase.from('contacts').update({ status: 'accepted' }).or(`and(requester_id.eq.${user?.id},responder_id.eq.${resolvedProfileId}),and(requester_id.eq.${resolvedProfileId},responder_id.eq.${user?.id})`);
        error = err;
    } else if (action === 'block') {
        const { error: err } = await supabase.from('contacts').upsert({ requester_id: user?.id, responder_id: resolvedProfileId, status: 'blocked' }).or(`and(requester_id.eq.${user?.id},responder_id.eq.${resolvedProfileId}),and(requester_id.eq.${resolvedProfileId},responder_id.eq.${user?.id})`);
        error = err;
    } else if (action === 'unblock') {
        const { data, error: err } = await supabase.from('contacts').delete().or(`and(requester_id.eq.${user?.id},responder_id.eq.${resolvedProfileId}),and(requester_id.eq.${resolvedProfileId},responder_id.eq.${user?.id})`).select();
        error = err;
        rowsAffected = data;
    }

    if ((action === 'remove' || action === 'reject' || action === 'unblock') && !error && (!rowsAffected || rowsAffected.length === 0)) {
        console.error(`Contact ${action} affected 0 rows (blocked by RLS or already removed)`, resolvedProfileId);
        alert(`Failed to ${action === 'unblock' ? 'unblock user' : action === 'reject' ? 'reject request' : 'remove contact'}: permission denied.`);
        return;
    }

    if (!error) {
        // Refetch relationship state
        const { data: contacts } = await supabase
            .from('contacts')
            .select('status, requester_id, responder_id')
            .or(`and(requester_id.eq.${user?.id},responder_id.eq.${resolvedProfileId}),and(requester_id.eq.${resolvedProfileId},responder_id.eq.${user?.id})`);
            
        if (contacts && contacts.length > 0) {
            const bestContact = contacts.sort((a, b) => {
                const priority = { 'accepted': 3, 'pending': 2, 'blocked': 1 };
                return (priority[b.status as keyof typeof priority] || 0) - (priority[a.status as keyof typeof priority] || 0);
            })[0];
            
            setContactRelation({
                status: bestContact.status,
                isIncoming: bestContact.responder_id === user?.id
            });
        } else {
            setContactRelation({ status: null, isIncoming: false });
        }
    }
  };

  const handleMessageAction = async () => {
    try {
        if (!user || !resolvedProfileId) return;

        const { data: conversationId, error: rpcError } = await supabase.rpc('create_private_conversation', {
            other_user_id: resolvedProfileId
        });

        if (rpcError) {
            console.error('Conversation creation failed:', JSON.stringify(rpcError, null, 2));
            alert('Could not start conversation. Please try again.');
            return;
        }

        if (!conversationId) {
            console.error('Conversation creation returned null ID');
            return;
        }

        navigate(`/dashboard/chat/${conversationId}`);
    } catch (err) {
        console.error('Unexpected error in handleMessageAction:', err);
    }
  };

  if (profileLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;
  if (!profile) return <div className="text-center py-20">Profile not found</div>;

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-8">
      <div className="overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-xl shadow-blue-100/40">
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 px-6 pt-8 pb-16 text-white relative">
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_top_right,_white,_transparent_45%)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">VoiceID Profile</p>
              <p className="mt-1 text-sm text-white/80">A profile you can share anywhere</p>
            </div>
            <button onClick={handleShare} disabled={sharing} className="rounded-full bg-white/15 p-3 backdrop-blur hover:bg-white/25 transition" aria-label="Share VoiceID profile">
              <Share size={20} />
            </button>
          </div>
        </div>

        <div className="relative px-5 sm:px-8 pb-8 -mt-12">
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-[2rem] bg-gray-100 mx-auto mb-4 overflow-hidden border-4 border-white shadow-lg relative">
              {profile.avatar_url ? <img src={profile.avatar_url} alt={`${profile.display_name} VoiceID profile`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-blue-600">{profile.display_name?.slice(0,1)?.toUpperCase() || '?'}</div>}
              {user?.id !== resolvedProfileId && (
                  <div className={`absolute bottom-2 right-2 w-4 h-4 rounded-full border-2 border-white ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
              )}
          </div>

          <div className="text-center">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-1 break-words text-gray-900">{profile.display_name}</h1>
            <p className="text-blue-600 font-semibold text-base sm:text-lg break-words">@{profile.username}</p>
            <p className="text-gray-500 text-sm mt-1">{user?.id === resolvedProfileId ? 'Your VoiceID' : isOnline ? '🟢 Online' : '⚪ Offline'}</p>

            <div className="mt-5 rounded-2xl bg-gray-50 border border-gray-100 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">VoiceID</p>
              <div className="flex items-center justify-between gap-3">
                <code className="font-bold text-gray-900 break-all">@{profile.username}</code>
                <button onClick={handleCopyProfile} className="shrink-0 rounded-full bg-white border border-gray-200 p-2 text-gray-600 hover:bg-gray-100" aria-label="Copy profile details">
                  {copied ? <Check size={17} className="text-green-600" /> : <Copy size={17} />}
                </button>
              </div>
            </div>

            <p className="text-gray-600 text-base sm:text-lg mt-5 leading-relaxed break-words">{profile.bio || 'Connect with me on VoiceID.'}</p>

            {!user && (
              <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-left">
                <div className="flex gap-3">
                  <UserRoundPlus className="text-blue-600 shrink-0" size={22} />
                  <div>
                    <p className="font-bold text-gray-900">Connect with @{profile.username}</p>
                    <p className="text-sm text-gray-600 mt-1">Create your free VoiceID account or sign in to send a friend request.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button onClick={() => navigate(`/auth/signup?ref=${encodeURIComponent(profile.username)}`)} className="py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition">Create VoiceID</button>
                  <button onClick={() => navigate(`/auth/login?ref=${encodeURIComponent(profile.username)}`)} className="py-3 rounded-xl bg-white border border-blue-200 text-blue-700 font-bold hover:bg-blue-100 transition"><LogIn size={16} className="inline mr-1" /> Sign in</button>
                </div>
              </div>
            )}

            {user?.id === resolvedProfileId && (
              <div className="flex flex-wrap gap-3 justify-center mt-7">
                <button onClick={() => navigate('/dashboard/profile/edit')} className="px-6 py-3 bg-blue-600 text-white rounded-full font-semibold">Edit Profile</button>
                <button onClick={handleShare} disabled={sharing} className="px-5 py-3 bg-gray-100 text-gray-700 rounded-full font-semibold hover:bg-gray-200 transition"><Share size={17} className="inline mr-2" /> Share Profile</button>
              </div>
            )}

            {user?.id !== resolvedProfileId && user && (
              <>
                {contactRelation.status === null && (
                  <button onClick={() => handleContactAction('add')} className="mt-6 w-full py-4 rounded-2xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition flex items-center justify-center gap-2">
                    <UserPlus size={20} /> Send Friend Request
                  </button>
                )}
                {contactRelation.status === 'pending' && !contactRelation.isIncoming && <div className="mt-6 py-4 rounded-2xl bg-amber-50 text-amber-700 font-semibold">Friend request pending</div>}
                {contactRelation.status === 'pending' && contactRelation.isIncoming && (
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <button onClick={() => handleContactAction('accept')} className="py-4 rounded-2xl bg-green-600 text-white font-bold"><UserCheck size={19} className="inline mr-1" /> Accept</button>
                    <button onClick={() => handleContactAction('reject')} className="py-4 rounded-2xl bg-red-50 text-red-700 font-bold"><UserX size={19} className="inline mr-1" /> Decline</button>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 justify-center mt-5">
                  <button onClick={handleCall} disabled={!isOnline || contactRelation.status !== 'accepted'} aria-label="Call" title="Call" className={`min-w-[92px] px-4 py-3 rounded-2xl transition flex items-center justify-center gap-2 font-semibold ${!isOnline || contactRelation.status !== 'accepted' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}><Phone size={20} /><span>Call</span></button>
                  <button onClick={handleVideoCall} disabled={!isOnline || contactRelation.status !== 'accepted'} aria-label="Video Call" title="Video Call" className={`min-w-[92px] px-4 py-3 rounded-2xl transition flex items-center justify-center gap-2 font-semibold ${!isOnline || contactRelation.status !== 'accepted' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}><Video size={20} /><span>Video</span></button>
                  <button onClick={handleMessageAction} aria-label="Message" title="Message" className="min-w-[108px] px-4 py-3 bg-purple-50 text-purple-600 rounded-2xl hover:bg-purple-100 transition flex items-center justify-center gap-2 font-semibold"><MessageCircle size={20} /><span>Message</span></button>
                  <button onClick={handleShare} aria-label="Share profile" title="Share profile" className="min-w-[92px] px-4 py-3 bg-gray-100 text-gray-600 rounded-2xl hover:bg-gray-200 transition flex items-center justify-center gap-2 font-semibold"><Share size={20} /><span>Share</span></button>
                  {contactRelation.status === 'accepted' && <button onClick={() => handleContactAction('remove')} aria-label="Remove contact" title="Remove contact" className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition"><UserX size={20} /></button>}
                  {contactRelation.status !== 'blocked' ? <button onClick={() => handleContactAction('block')} aria-label="Block user" title="Block user" className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition"><Ban size={20} /></button> : <button onClick={() => handleContactAction('unblock')} aria-label="Unblock user" title="Unblock user" className="p-3 bg-green-50 text-green-600 rounded-2xl hover:bg-green-100 transition"><UserPlus size={20} /></button>}
                </div>
              </>
            )}

            <div className="mt-7 flex items-center justify-center gap-2 text-xs text-gray-400">
              <Link2 size={14} /> Share this profile to invite people to VoiceID
            </div>
            {copied && <p className="mt-2 text-sm font-semibold text-green-600">Profile details copied</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
