import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Check, X, Loader2, Bell } from 'lucide-react';

export default function NotificationsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    console.log("Fetching requests for user:", user?.id);
    const { data: reqData, error } = await supabase
        .from('contacts')
        .select('*, profiles:requester_id(*)')
        .eq('responder_id', user?.id)
        .eq('status', 'pending');
    
    if (error) console.error("Error fetching requests:", error);
    console.log("Fetched requests:", reqData);
    
    if (reqData) setRequests(reqData);

    const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
    if (notifData) setNotifications(notifData);
    setLoading(false);
  };

  const handleAction = async (id: string, status: 'accepted' | 'rejected') => {
    await supabase.from('contacts').update({ status }).eq('id', id);
    fetchData();
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500" size={32}/></div>;

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Notifications</h1>
      
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Contact Requests</h2>
        {requests.length === 0 ? <p className="text-gray-500">No new requests.</p> :
        requests.map(req => (
            <div key={req.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl">
                <p>{req.profiles.display_name} sent you a request.</p>
                <div className="flex gap-2">
                    <button onClick={() => handleAction(req.id, 'accepted')} className="p-2 bg-green-50 text-green-600 rounded-full"><Check /></button>
                    <button onClick={() => handleAction(req.id, 'rejected')} className="p-2 bg-red-50 text-red-600 rounded-full"><X /></button>
                </div>
            </div>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Notifications</h2>
        {notifications.length === 0 ? <p className="text-gray-500">No notifications.</p> :
        notifications.map(notif => (
            <div key={notif.id} className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl">
                <Bell className="text-blue-500" />
                <div>
                    <p className="font-semibold">{notif.title}</p>
                    <p className="text-sm text-gray-600">{notif.message}</p>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
}
