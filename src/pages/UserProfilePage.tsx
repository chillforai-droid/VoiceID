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

  if (profileLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={34}/></div>;
  if (!profile) return <div className="py-20 text-center font-semibold text-slate-500">Profile not found</div>;

  const isOwnProfile = user?.id === resolvedProfileId;
  const profileUrl = getProfileShareUrl();

  return (
    <div className="min-h-full bg-[#f7f8ff] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="overflow-hidden rounded-[32px] bg-white shadow-sm ring-1 ring-slate-100">
          <div className="relative h-52 overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-fuchsia-700 sm:h-64">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,.3),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(236,72,153,.3),transparent_40%)]" />
            <div className="absolute bottom-5 left-5 max-w-xs text-white sm:left-8"><p className="text-xs font-bold uppercase tracking-[0.28em] text-white/70">More Than Just a Profile</p><p className="mt-2 text-sm text-white/90 sm:text-base">Your Voice. Your Story. Your Identity.</p></div>
            <button onClick={handleShare} disabled={sharing} className="absolute right-5 top-5 rounded-full bg-white/15 p-3 text-white backdrop-blur hover:bg-white/25" aria-label="Share profile"><Share size={21}/></button>
          </div>

          <div className="relative px-5 pb-7 sm:px-8">
            <div className="-mt-16 flex flex-col items-center sm:-mt-20">
              <div className="relative h-32 w-32 overflow-hidden rounded-[34px] border-4 border-white bg-slate-100 shadow-xl sm:h-36 sm:w-36">
                {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover"/> : <div className="flex h-full w-full items-center justify-center text-4xl font-extrabold text-indigo-600">{(profile.display_name || 'V').slice(0,1).toUpperCase()}</div>}
                <span className={`absolute bottom-2 right-2 h-5 w-5 rounded-full border-4 border-white ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </div>
              <div className="mt-4 flex items-center gap-2"><h1 className="text-3xl font-extrabold tracking-tight text-slate-950">{profile.display_name}</h1><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">✓</span></div>
              <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-blue-600">@{profile.username}<button onClick={handleCopyProfile} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Copy profile"><Copy size={16}/></button></div>
              <p className="mt-2 max-w-xl text-center text-slate-500">{profile.bio || 'Your VoiceID profile — share your voice and connect with people.'}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-slate-500"><span className="rounded-full bg-slate-50 px-3 py-1.5">🟢 {isOnline ? 'Online' : 'Offline'}</span><span className="rounded-full bg-slate-50 px-3 py-1.5">VoiceID @{profile.username}</span></div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-center">
              {isOwnProfile ? <><button onClick={() => navigate('/dashboard/profile/edit')} className="rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 font-bold text-white shadow-lg"><span className="mr-2">✎</span>Edit Profile</button><button onClick={handleShare} disabled={sharing} className="rounded-full bg-slate-100 px-6 py-3 font-bold text-slate-700"><Share size={17} className="mr-2 inline"/>Share Profile</button></> : user ? <><button onClick={() => handleContactAction(contactRelation.status === 'pending' && contactRelation.isIncoming ? 'accept' : 'add')} className="rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 font-bold text-white">{contactRelation.status === 'accepted' ? 'Friends' : contactRelation.status === 'pending' ? (contactRelation.isIncoming ? 'Accept Request' : 'Request Sent') : 'Add Friend'}</button><button onClick={handleMessageAction} className="rounded-full bg-slate-100 px-5 py-3 font-bold text-slate-700"><MessageCircle size={17} className="mr-2 inline"/>Message</button></> : <><button onClick={() => navigate(`/auth/signup?ref=${encodeURIComponent(profile.username)}`)} className="rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 font-bold text-white">Create VoiceID</button><button onClick={() => navigate(`/auth/login?ref=${encodeURIComponent(profile.username)}`)} className="rounded-full bg-slate-100 px-5 py-3 font-bold text-slate-700">Sign In</button></>}
            </div>

            {isOwnProfile && <div className="mt-5 rounded-3xl bg-gradient-to-r from-amber-50 via-pink-50 to-violet-50 p-4 ring-1 ring-white"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-xl">👑</span><div className="flex-1"><p className="font-extrabold text-slate-950">VoiceID Creator</p><p className="text-sm text-slate-500">Create amazing rooms, grow your community and make your voice count.</p></div><button onClick={() => navigate('/dashboard/rooms')} className="rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-bold text-white">Explore</button></div></div>}
          </div>
        </section>

        <div className="rounded-3xl bg-white p-1 shadow-sm ring-1 ring-slate-100"><div className="grid grid-cols-4 text-center text-sm font-bold text-slate-500"><button className="rounded-2xl bg-indigo-50 py-3 text-indigo-700">Profile</button><button onClick={() => navigate('/dashboard/rooms')} className="py-3">Rooms</button><button className="py-3">Media</button><button className="py-3">About</button></div></div>

        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">About {profile.display_name}</h2><span className="text-xs text-slate-400">VoiceID</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{profile.bio || 'This user has not added a bio yet.'}</p><div className="mt-5 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Public profile link</p><div className="mt-2 flex items-center gap-2"><Link2 size={17} className="text-indigo-600"/><span className="min-w-0 flex-1 truncate text-sm font-semibold text-indigo-700">{profileUrl}</span><button onClick={handleCopyProfile} className="rounded-full bg-white p-2 ring-1 ring-slate-200"><Copy size={16}/></button></div></div></div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><h2 className="text-lg font-extrabold">VoiceID Actions</h2><div className="mt-3 space-y-2"><button onClick={handleShare} className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left font-semibold text-slate-700"><Share size={19} className="text-indigo-600"/>Share profile</button>{!isOwnProfile && user && <><button onClick={handleCall} disabled={!isOnline || contactRelation.status !== 'accepted'} className="flex w-full items-center gap-3 rounded-2xl bg-indigo-50 p-3 text-left font-semibold text-indigo-700 disabled:opacity-40"><Phone size={19}/>Voice call</button><button onClick={handleVideoCall} disabled={!isOnline || contactRelation.status !== 'accepted'} className="flex w-full items-center gap-3 rounded-2xl bg-violet-50 p-3 text-left font-semibold text-violet-700 disabled:opacity-40"><Video size={19}/>Video call</button></>}</div></div>
        </section>

        {copied && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-xl"><Check size={16} className="mr-2 inline text-emerald-400"/>Profile copied</div>}
      </div>
    </div>
  );
}
