import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export const NotificationContext = createContext<any>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    const channel = supabase
      .channel('realtime:notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, 
        (payload) => {
          setNotifications(prev => {
              if (prev.find(n => n.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
          });
          if (!payload.new.is_read) {
            setUnreadCount(prev => prev + 1);
            if (payload.new.type === 'message') setUnreadMessageCount(prev => prev + 1);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
        setUnreadMessageCount(data.filter(n => !n.is_read && n.type === 'message').length);
    }
  }

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? {...n, is_read: true} : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  const markConversationRead = async (conversationId: string) => {
    if (!user) return;
    const { data: notifs } = await supabase.from('notifications').update({ is_read: true })
        .eq('user_id', user.id).eq('related_id', conversationId).eq('type', 'message').select();
    
    if (notifs) {
        const count = notifs.length;
        setUnreadMessageCount(prev => Math.max(0, prev - count));
        setUnreadCount(prev => Math.max(0, prev - count));
        setNotifications(prev => prev.map(n => n.related_id === conversationId ? {...n, is_read: true} : n));
    }
  }

  return <NotificationContext.Provider value={{ notifications, unreadCount, unreadMessageCount, markAsRead, markConversationRead }}>{children}</NotificationContext.Provider>
}

export const useNotifications = () => useContext(NotificationContext);
