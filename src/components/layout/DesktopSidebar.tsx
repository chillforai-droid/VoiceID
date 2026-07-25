import { Home, Search, Mail, Bell, Settings, LogOut, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const menuItems = [
  { icon: Home, label: 'Home', path: '/dashboard' },
  { icon: Search, label: 'Search', path: '/dashboard/search' },
  { icon: Mail, label: 'Messages', path: '/dashboard/messages' },
  { icon: Bell, label: 'Notifications', path: '/dashboard/notifications' },
  { icon: User, label: 'Profile', path: '/dashboard/profile/me' },
  { icon: Settings, label: 'Settings', path: '/dashboard/settings' },
];

export default function DesktopSidebar() {
  const { signOut } = useAuth();

  return (
    <div className="w-64 border-r border-gray-200 h-screen flex flex-col p-4 bg-white">
      <div className="flex items-center p-4 mb-8">
        <div className="text-2xl font-bold text-blue-600">VoiceID</div>
      </div>
      
      <nav className="flex-1 flex flex-col gap-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 p-3 rounded-xl transition ${
                isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={signOut}
        className="flex items-center gap-3 p-3 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-xl transition"
      >
        <LogOut size={20} />
        Sign Out
      </button>
    </div>
  );
}
