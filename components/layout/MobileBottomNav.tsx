import { memo } from 'react';
import {
  Home,
  Search,
  MessageSquare,
  Bell,
  User,
  Mic,
} from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

function MobileBottomNav() {
  const { user } = useAuth();
  const { unreadCount, unreadMessageCount } = useNotifications();

  const navItems = [
    {
      name: 'Home',
      path: '/dashboard',
      icon: Home,
      badge: 0,
    },
    {
      name: 'Explore',
      path: '/dashboard/search',
      icon: Search,
      badge: 0,
    },
    {
      name: 'Messages',
      path: '/dashboard/messages',
      icon: MessageSquare,
      badge: unreadMessageCount,
    },
    {
      name: 'Activity',
      path: '/dashboard/notifications',
      icon: Bell,
      badge: unreadCount,
    },
    {
      name: 'Profile',
      path: user
        ? `/dashboard/profile/${user.id}`
        : '/dashboard/profile/me',
      icon: User,
      badge: 0,
    },
  ];

  return (
    <nav className="relative h-[76px] border-t border-slate-200/80 bg-white px-2 shadow-[0_-8px_30px_rgba(15,23,42,0.06)]">
      {/* Center voice button */}
      <Link
        to="/dashboard/rooms"
        aria-label="Voice Rooms"
        className="absolute left-1/2 top-[-27px] z-10 flex h-[58px] w-[58px] -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-white bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-500/30"
      >
        <Mic size={25} strokeWidth={2.4} />
      </Link>

      <div className="grid h-full grid-cols-5">
        {navItems.map((item, index) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 pt-2 text-[10px] font-semibold transition-colors ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-slate-500'
                } ${index === 2 ? 'pr-7' : ''} ${
                  index === 3 ? 'pl-7' : ''
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      isActive
                        ? 'bg-blue-50'
                        : ''
                    }`}
                  >
                    <Icon
                      size={23}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  </span>

                  {item.badge > 0 && (
                    <span className="absolute top-1 right-1/2 translate-x-4 rounded-full bg-red-500 px-1.5 text-[9px] font-bold leading-[18px] text-white">
                      {item.badge > 99
                        ? '99+'
                        : item.badge}
                    </span>
                  )}

                  <span>{item.name}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Keep the middle button visually separated from the nav labels. */}
      <div className="pointer-events-none absolute left-1/2 top-[-3px] h-10 w-20 -translate-x-1/2 rounded-full bg-white" />
      <Link
        to="/dashboard/rooms"
        aria-label="Start Voice"
        className="absolute left-1/2 top-[-27px] z-20 flex h-[58px] w-[58px] -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-white bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-500/30"
      >
        <Mic size={25} strokeWidth={2.4} />
      </Link>
    </nav>
  );
}

export default memo(MobileBottomNav);
