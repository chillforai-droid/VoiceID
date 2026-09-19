import { memo } from 'react';
import { Compass, Home, MessageCircle, Mic2, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

function MobileBottomNav() {
  const { user } = useAuth();
  const { unreadMessageCount, unreadCount } = useNotifications();

  const items = [
    { name: 'Home', path: '/dashboard', icon: Home, badge: 0 },
    { name: 'Explore', path: '/dashboard/search', icon: Compass, badge: 0 },
    { name: 'Voice', path: '/dashboard/rooms', icon: Mic2, center: true, badge: 0 },
    { name: 'Activity', path: '/dashboard/messages', icon: MessageCircle, badge: unreadMessageCount + unreadCount },
    { name: 'Profile', path: user ? `/dashboard/profile/${user.id}` : '/dashboard/profile/me', icon: User, badge: 0 },
  ];

  return (
    <nav className="mx-auto flex h-[82px] max-w-3xl items-center justify-around border-t border-slate-200/80 bg-white/95 px-2 shadow-[0_-12px_35px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition ${
                item.center
                  ? 'text-slate-700'
                  : isActive
                    ? 'text-indigo-700'
                    : 'text-slate-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {item.center ? (
                  <span className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-[0_10px_25px_rgba(79,70,229,0.35)] ring-8 ring-[#f7f8ff] transition-transform active:scale-95">
                    <Mic2 size={29} strokeWidth={2.4} />
                  </span>
                ) : (
                  <span className={`flex h-9 w-12 items-center justify-center rounded-full transition ${isActive ? 'bg-indigo-50' : ''}`}>
                    <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                )}

                <span className={item.center ? 'mt-0.5' : ''}>{item.name}</span>

                {item.badge > 0 && (
                  <span className="absolute right-1/2 top-1 translate-x-6 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white ring-2 ring-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default memo(MobileBottomNav);
