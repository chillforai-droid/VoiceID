import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Phone, Mic, UserPlus, Loader2, UserCheck, UserX, Ban } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function UserProfilePage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [contactRelation, setContactRelation] = useState<{ status: string | null, isIncoming: boolean }>({ status: null, isIncoming: false });
  const [profileLoading, setProfileLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    const fetchData = async () => {
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', id).single();
      setProfile(profileData);
      
      if (user) {
        const { data: contacts } = await supabase
            .from('contacts')
            .select('status, requester_id, responder_id')
            .or(`and(requester_id.eq.${user?.id},responder_id.eq.${id}),and(requester_id.eq.${id},responder_id.eq.${user?.id})`);
            
        if (contacts && contacts.length > 0) {
            // Find "best" status: accepted > pending > blocked
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
  }, [id, user, authLoading]);

  const handleContactAction = async (action: 'add' | 'accept' | 'reject' | 'remove' | 'block' | 'unblock') => {
    if (!user) return;
    
    let error;
    if (action === 'add') {
        const { error: err } = await supabase.from('contacts').insert({ requester_id: user?.id, responder_id: id, status: 'pending' });
        error = err;
    } else if (action === 'remove' || action === 'reject') {
        const { error: err } = await supabase.from('contacts').delete().or(`and(requester_id.eq.${user?.id},responder_id.eq.${id}),and(requester_id.eq.${id},responder_id.eq.${user?.id})`);
        error = err;
    } else if (action === 'accept') {
        const { error: err } = await supabase.from('contacts').update({ status: 'accepted' }).or(`and(requester_id.eq.${user?.id},responder_id.eq.${id}),and(requester_id.eq.${id},responder_id.eq.${user?.id})`);
        error = err;
    } else if (action === 'block') {
        const { error: err } = await supabase.from('contacts').upsert({ requester_id: user?.id, responder_id: id, status: 'blocked' }).or(`and(requester_id.eq.${user?.id},responder_id.eq.${id}),and(requester_id.eq.${id},responder_id.eq.${user?.id})`);
        error = err;
    } else if (action === 'unblock') {
        const { error: err } = await supabase.from('contacts').delete().or(`and(requester_id.eq.${user?.id},responder_id.eq.${id}),and(requester_id.eq.${id},responder_id.eq.${user?.id})`);
        error = err;
    }

    if (!error) {
        // Refetch relationship state
        const { data: contacts } = await supabase
            .from('contacts')
            .select('status, requester_id, responder_id')
            .or(`and(requester_id.eq.${user?.id},responder_id.eq.${id}),and(requester_id.eq.${id},responder_id.eq.${user?.id})`);
            
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
        if (!user || !id) return;

        const { data: conversationId, error: rpcError } = await supabase.rpc('create_private_conversation', {
            other_user_id: id
        });

        if (rpcError) {
            console.error('Conversation creation failed:', rpcError);
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
    <div className="max-w-xl mx-auto p-8 bg-white border border-gray-100 rounded-3xl shadow-sm">
      <div className="text-center">
        <div className="w-32 h-32 rounded-3xl bg-gray-100 mx-auto mb-6 overflow-hidden border-2 border-gray-200">
            {profile.avatar_url && <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />}
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-1">{profile.display_name}</h1>
        <p className="text-blue-600 font-medium text-lg mb-6">@{profile.username}</p>
        <p className="text-gray-600 text-lg mb-10 leading-relaxed">{profile.bio || 'No bio yet.'}</p>
        
        <div className="flex gap-4 justify-center">
            <button className="p-5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition"><Phone size={24} /></button>
            <button onClick={handleMessageAction} className="p-5 bg-purple-50 text-purple-600 rounded-full hover:bg-purple-100 transition"><Mic size={24} /></button>
            {contactRelation.status === null && <button onClick={() => handleContactAction('add')} className="p-5 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition"><UserPlus size={24} /></button>}
            {contactRelation.status === 'pending' && contactRelation.isIncoming && (
                <>
                    <button onClick={() => handleContactAction('accept')} className="p-5 bg-green-50 text-green-600 rounded-full"><UserCheck size={24} /></button>
                    <button onClick={() => handleContactAction('reject')} className="p-5 bg-red-50 text-red-600 rounded-full"><UserX size={24} /></button>
                </>
            )}
            {contactRelation.status === 'pending' && !contactRelation.isIncoming && <button className="p-5 bg-yellow-50 text-yellow-600 rounded-full"><UserCheck size={24} /></button>}
            {contactRelation.status === 'accepted' && <button onClick={() => handleContactAction('remove')} className="p-5 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition"><UserX size={24} /></button>}
            {contactRelation.status !== 'blocked' ? 
                <button onClick={() => handleContactAction('block')} className="p-5 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition"><Ban size={24} /></button> :
                <button onClick={() => handleContactAction('unblock')} className="p-5 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition"><UserPlus size={24} /></button>
            }
        </div>
      </div>
    </div>
  );
}
