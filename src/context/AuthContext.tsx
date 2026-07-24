import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
  updateProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let initialSessionLoaded = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      initialSessionLoaded = true;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id, session.user);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!initialSessionLoaded) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id, session.user);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, user: User) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    
    // Sync Google avatar if missing
    if (data && !data.avatar_url && user.user_metadata.avatar_url) {
        await supabase.from('profiles').update({ avatar_url: user.user_metadata.avatar_url }).eq('id', userId);
        setProfile({ ...data, avatar_url: user.user_metadata.avatar_url });
    } else {
        setProfile(data);
    }
    setLoading(false);
  };

  const updateProfile = async () => {
    if (user) await fetchProfile(user.id, user);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
