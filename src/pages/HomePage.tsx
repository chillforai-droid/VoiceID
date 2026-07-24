import QuickActions from '../components/dashboard/QuickActions';
import ActivityFeed from '../components/dashboard/ActivityFeed';

export default function HomePage() {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Welcome Back</h1>
      <QuickActions />
      <ActivityFeed />
    </div>
  );
}
