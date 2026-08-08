import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { updateProfile } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      // Wait for session to be established
      const { data: { session }, error } = await supabase.auth.getSession();
      

      if (error || !session) {
        console.error('Callback error or no session:', error);
        navigate('/auth/login', { replace: true });
        return;
      }
      

      const sharedRef = typeof window !== 'undefined' ? window.localStorage.getItem('voiceid_shared_profile_ref') : null;

      // Check profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();


      if (profileError || !profile || !profile.username) {
        navigate(sharedRef ? `/auth/choose-id?ref=${encodeURIComponent(sharedRef)}` : '/auth/choose-id', { replace: true });
      } else {
        await updateProfile();
        navigate(sharedRef ? `/u/${encodeURIComponent(sharedRef)}` : '/dashboard', { replace: true });
      }
    };

    handleCallback();
  }, [navigate, updateProfile]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Authenticating...</p>
    </div>
  );
}
