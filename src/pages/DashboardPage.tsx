import { useState } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import Navbar from '../components/dashboard/Navbar';
import { Outlet } from 'react-router-dom';

export default function DashboardPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-white">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col">
        <Navbar onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
