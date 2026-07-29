import React from 'react';
import { useLocation } from 'react-router-dom';
import MobileBottomNav from './MobileBottomNav';
import DesktopSidebar from './DesktopSidebar';
import { CallManager } from '../chat/CallManager';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith('/dashboard/chat/');

  return (
    <div className="flex h-[100dvh] bg-gray-50">
      <CallManager />
      {/* Desktop Sidebar */}
      {!isChatRoute && (
        <div className="hidden md:flex">
          <DesktopSidebar />
        </div>
      )}
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Header (Contextual) */}
        {!isChatRoute && (
          <header className="pt-safe h-16 border-b border-gray-200 bg-white flex items-center px-4 justify-between md:hidden shrink-0">
            <h1 className="font-semibold text-lg text-gray-900">VoiceID</h1>
          </header>
        )}
        
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          {children}
        </main>
      </div>
      
      {/* Mobile Bottom Nav */}
      {!isChatRoute && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe bg-white">
          <MobileBottomNav />
        </div>
      )}
    </div>
  );
}
