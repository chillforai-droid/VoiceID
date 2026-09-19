import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Search, Settings, Mic2 } from 'lucide-react';
import MobileBottomNav from './MobileBottomNav';
import DesktopSidebar from './DesktopSidebar';
import { CallManager } from '../chat/CallManager';
import NotificationBell from '../notifications/NotificationBell';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation();

  const isImmersiveRoute =
    location.pathname.startsWith('/dashboard/chat/') ||
    /^\/dashboard\/rooms\/[^/]+$/.test(location.pathname);

  return (
    <div className="flex h-[100dvh] bg-[#f7f8ff] text-slate-950">
      <CallManager />

      {!isImmersiveRoute && (
        <div className="hidden md:flex">
          <DesktopSidebar />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!isImmersiveRoute && (
          <header className="pt-safe z-40 shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl md:hidden">
            <div className="flex h-16 items-center justify-between px-4">
              <Link to="/dashboard" className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-md">
                  <Mic2 size={21} strokeWidth={2.3} />
                </span>
                <span className="text-[21px] font-extrabold tracking-tight text-slate-950">
                  Voice<span className="text-indigo-600">ID</span>
                </span>
              </Link>

              <div className="flex items-center gap-1">
                <Link
                  to="/dashboard/search"
                  aria-label="Search VoiceID"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
                >
                  <Search size={22} />
                </Link>
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600">
                  <NotificationBell />
                </span>
                <Link
                  to="/dashboard/settings"
                  aria-label="Settings"
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-slate-100 ${location.pathname === '/dashboard/settings' ? 'text-indigo-600' : 'text-slate-600'}`}
                >
                  <Settings size={22} />
                </Link>
              </div>
            </div>
          </header>
        )}

        <main className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${isImmersiveRoute ? '' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-0'}`}>
          {children}
        </main>
      </div>

      {!isImmersiveRoute && (
        <div className="pb-safe fixed bottom-0 left-0 right-0 z-50 md:hidden">
          <MobileBottomNav />
        </div>
      )}
    </div>
  );
}
