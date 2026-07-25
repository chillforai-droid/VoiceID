import AppShell from '../components/layout/AppShell';
import { Outlet } from 'react-router-dom';

export default function DashboardPage() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
