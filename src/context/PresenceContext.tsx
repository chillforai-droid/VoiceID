import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface PresenceContextType {
    onlineUsers: Set<string>;
    isUserOnline: (userId: string) => boolean;
}

const PresenceContext = createContext<PresenceContextType>({} as PresenceContextType);

export const PresenceProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [aiUsers, setAiUsers] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!user) {
            setOnlineUsers(new Set());
            setAiUsers(new Set());
            return;
        }

        let cancelled = false;
        void supabase
            .from('profiles')
            .select('id')
            .eq('is_ai', true)
            .then(({ data }) => {
                if (cancelled) return;
                setAiUsers(new Set((data || []).map((profile: any) => profile.id).filter(Boolean)));
            });

        const channel = supabase.channel('voiceid:online-users');

        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            const users = new Set<string>();
            Object.values(state).forEach((items: any) => {
                items.forEach((item: any) => {
                    if (item.user_id) users.add(item.user_id);
                });
            });
            setOnlineUsers(users);
        });

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    user_id: user.id,
                    online_at: new Date().toISOString()
                });
            }
        });

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
        };
    }, [user]);

    const isUserOnline = useCallback(
        (userId: string) => Boolean(userId) && (aiUsers.has(userId) || onlineUsers.has(userId)),
        [aiUsers, onlineUsers],
    );

    const value = useMemo(() => ({ onlineUsers, isUserOnline }), [onlineUsers, isUserOnline]);

    return (
        <PresenceContext.Provider value={value}>
            {children}
        </PresenceContext.Provider>
    );
};

export const usePresence = () => useContext(PresenceContext);
