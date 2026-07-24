import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { updateProfile } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      console.log('AuthCallbackPage mounted, URL:', window.location.href);
      // Wait for session to be established
      const { data: { session }, error } = await supabase.auth.getSession();
      
      console.log('Session check:', { session, error });

      if (error || !session) {
        console.error('Callback error or no session:', error);
        navigate('/auth/login', { replace: true });
        return;
      }
      
      console.log('Authenticated User ID:', session.user.id);

      // Check profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      console.log('Profile check:', { profile, profileError });

      if (profileError || !profile || !profile.username) {
        console.log('Redirecting to /auth/choose-id');
        navigate('/auth/choose-id', { replace: true });
      } else {
        await updateProfile();
        console.log('Redirecting to /dashboard');
        navigate('/dashboard', { replace: true });
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
