import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Settings,
  MessageSquare,
  Users,
  ShoppingBag,
  Mic,
  Crown,
  ArrowRight,
  Sparkles,
  Bell,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { StoriesBar } from '../components/stories/StoriesBar';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { useCreatorRooms } from '../hooks/useRooms';

export default function HomePage() {
  const { profile } = useAuth();
  const displayName = profile?.display_name || 'there';

  const { rooms: creatorRooms } = useCreatorRooms();

  const trendingRooms = useMemo(
    () => creatorRooms.filter((room) => room.is_featured || room.member_count > 0).slice(0, 5),
    [creatorRooms]
  );

  const quickActions = [
    {
      label: 'Messages',
      icon: MessageSquare,
      path: '/dashboard/messages',
      className: 'from-blue-500 to-cyan-400',
      badge: null,
    },
    {
      label: 'Rooms',
      icon: Users,
      path: '/dashboard/rooms',
      className: 'from-violet-500 to-purple-500',
      badge: null,
    },
    {
      label: 'Store',
      icon: ShoppingBag,
      path: '/store',
      className: 'from-emerald-400 to-green-500',
      badge: null,
    },
    {
      label: 'Search',
      icon: Search,
      path: '/dashboard/search',
      className: 'from-orange-400 to-amber-500',
      badge: null,
    },
    {
      label: 'Voice Rooms',
      icon: Mic,
      path: '/dashboard/rooms',
      className: 'from-pink-500 to-rose-500',
      badge: null,
    },
    {
      label: 'Premium',
      icon: Crown,
      path: '/dashboard/settings',
      className: 'from-purple-400 to-indigo-500',
      badge: null,
    },
  ];

  return (
    <div className="min-h-full bg-[#f7f8fc] text-slate-900">
      {/* Premium mobile header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20">
              <Mic className="text-white" size={21} strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-[19px] font-black tracking-tight">
                Voice<span className="text-violet-600">ID</span>
              </div>
              <div className="text-[10px] font-medium text-slate-500">Your Voice, Your Identity</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Link
              to="/dashboard/search"
              aria-label="Search"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-700"
            >
              <Search size={21} />
            </Link>
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-700">
              <NotificationBell />
            </div>
            <Link
              to="/dashboard/settings"
              aria-label="Settings"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-700"
            >
              <Settings size={21} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-6 pt-4 md:px-6">
        {/* Welcome hero */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-sky-100 via-indigo-100 to-fuchsia-100 p-5 shadow-sm">
          <div className="absolute -right-16 -bottom-24 h-56 w-56 rounded-full bg-violet-300/40 blur-2xl" />
          <div className="absolute right-20 -bottom-16 h-32 w-72 rotate-[-12deg] rounded-[50%] border-[18px] border-white/35" />

          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="h-[76px] w-[76px] rounded-full border-4 border-white object-cover shadow-md"
                />
              ) : (
                <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-blue-500 to-violet-600 text-2xl font-bold text-white shadow-md">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-400" />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700">Hello,</p>
              <h1 className="truncate text-[25px] font-black leading-tight tracking-tight text-slate-950">
                {displayName} <span className="text-xl">👋</span>
              </h1>
              <p className="mt-1 text-sm text-slate-600">How&apos;s your voice today?</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Online
              </span>
            </div>

            <div className="ml-auto hidden max-w-[180px] shrink-0 text-right sm:block">
              <p className="text-sm font-medium text-slate-800">Good conversations</p>
              <p className="text-sm text-slate-600">Create a better world 💙</p>
            </div>
          </div>
        </section>

        {/* Stories */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-tight">Your Story</h2>
            <span className="text-sm font-semibold text-slate-500">See All <ArrowRight className="ml-1 inline" size={15} /></span>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white/60 p-1">
            <StoriesBar />
          </div>
        </section>

        {/* Promotional banner */}
        <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-[#171449] via-[#282064] to-[#11183e] px-5 py-6 text-white shadow-lg shadow-indigo-900/10">
          <div className="absolute -right-10 -top-20 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="absolute right-12 bottom-0 h-24 w-40 rounded-full bg-blue-400/20 blur-2xl" />

          <div className="relative max-w-[80%]">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-200">
              <Sparkles size={14} />
              VoiceID
            </div>
            <h2 className="text-2xl font-black leading-tight">More Than Messages</h2>
            <p className="mt-1 text-sm text-indigo-100">A private space for your voice</p>
            <p className="mt-2 text-xs text-indigo-200">Chat · Create Rooms · Share Moments · Be Yourself</p>

            <Link
              to="/dashboard/rooms"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md"
            >
              Explore Now <ArrowRight size={16} />
            </Link>
          </div>

          <div className="absolute right-5 bottom-5 hidden h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/50 to-blue-500/20 sm:flex">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10">
              <Mic size={38} />
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-tight">Quick Actions</h2>
            <Link to="/dashboard/search" className="text-sm font-semibold text-slate-500">
              View All <ArrowRight className="ml-1 inline" size={15} />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-6">
            {quickActions.map((action) => (
              <Link key={action.label} to={action.path} className="group text-center">
                <div className={`relative mx-auto flex h-[66px] w-[66px] items-center justify-center rounded-[20px] bg-gradient-to-br ${action.className} text-white shadow-lg transition-transform group-active:scale-95`}>
                  <action.icon size={29} strokeWidth={2.2} />
                </div>
                <span className="mt-2 block truncate text-xs font-semibold text-slate-700">{action.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Two feature cards */}
        <section className="grid gap-3 sm:grid-cols-2">
          <Link to="/dashboard/rooms" className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
              <Users size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold">Join Rooms</h3>
              <p className="text-xs text-slate-500">Meet people in voice rooms</p>
            </div>
            <ArrowRight className="text-slate-400" size={20} />
          </Link>

          <Link to="/store" className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white">
              <ShoppingBag size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold">VoiceID Store</h3>
              <p className="text-xs text-slate-500">Explore products & support creators</p>
            </div>
            <ArrowRight className="text-slate-400" size={20} />
          </Link>
        </section>

        {/* Trending creator rooms */}
        {trendingRooms.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-extrabold tracking-tight">🔥 Trending Rooms</h2>
              <Link to="/dashboard/rooms?tab=creators" className="text-sm font-semibold text-slate-500">
                See All <ArrowRight className="ml-1 inline" size={15} />
              </Link>
            </div>

            <div className="flex snap-x gap-3 overflow-x-auto pb-2">
              {trendingRooms.map((room) => (
                <Link
                  key={room.id}
                  to={`/dashboard/rooms/${room.id}`}
                  className="relative h-44 min-w-[205px] snap-start overflow-hidden rounded-2xl bg-slate-900 shadow-sm"
                >
                  {room.cover_url ? (
                    <img src={room.cover_url} alt={room.name} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                    <p className="truncate text-sm font-bold">{room.name}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-white/85">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {room.member_count} online
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
