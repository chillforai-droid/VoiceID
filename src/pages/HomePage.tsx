import { useMemo } from 'react';
import {
  ArrowRight,
  Crown,
  Headphones,
  Mail,
  Mic,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Users,
  MessageCircle,
  Compass,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { StoriesBar } from '../components/stories/StoriesBar';
import { useCreatorRooms } from '../hooks/useRooms';
import { useNotifications } from '../context/NotificationContext';

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || 'V';
}

const roomGradients = [
  'from-indigo-950 via-violet-900 to-fuchsia-800',
  'from-orange-950 via-amber-800 to-yellow-600',
  'from-slate-950 via-blue-900 to-cyan-700',
  'from-fuchsia-950 via-purple-900 to-pink-700',
  'from-emerald-950 via-teal-800 to-cyan-700',
];

export default function HomePage() {
  const { profile } = useAuth();
  const { unreadMessageCount } = useNotifications();
  const { rooms, loading } = useCreatorRooms();

  const displayName = profile?.display_name || profile?.username || 'there';
  const featuredRooms = useMemo(
    () => rooms.slice(0, 6),
    [rooms],
  );

  const quickActions = [
    {
      label: 'Messages',
      icon: Mail,
      path: '/dashboard/messages',
      gradient: 'from-blue-500 to-indigo-600',
      badge: unreadMessageCount,
    },
    {
      label: 'Rooms',
      icon: Users,
      path: '/dashboard/rooms',
      gradient: 'from-violet-500 to-purple-600',
    },
    {
      label: 'Store',
      icon: ShoppingBag,
      path: '/store',
      gradient: 'from-emerald-400 to-green-600',
    },
    {
      label: 'Search',
      icon: Search,
      path: '/dashboard/search',
      gradient: 'from-amber-400 to-orange-500',
    },
    {
      label: 'Voice Post',
      icon: Mic,
      path: '/dashboard/rooms',
      gradient: 'from-pink-500 to-rose-600',
    },
    {
      label: 'Premium',
      icon: Crown,
      path: '/dashboard/settings',
      gradient: 'from-purple-400 to-fuchsia-600',
    },
  ];

  return (
    <div className="min-h-full bg-[#f7f8ff] px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-7">
        {/* Welcome / identity hero */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-sky-100 via-indigo-100 to-fuchsia-100 p-5 shadow-[0_12px_40px_rgba(67,56,202,0.10)] sm:p-7">
          <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-white/30 blur-2xl" />
          <div className="absolute -bottom-24 right-20 h-56 w-80 rounded-[50%] bg-indigo-300/25 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  decoding="async"
                  className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-lg sm:h-24 sm:w-24"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-blue-500 to-violet-600 text-2xl font-bold text-white shadow-lg sm:h-24 sm:w-24">
                  {initials(displayName)}
                </div>
              )}
              <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-4 border-white bg-emerald-500" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-700 sm:text-base">Hello,</p>
              <h1 className="truncate text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                {displayName} <span aria-hidden="true">👋</span>
              </h1>
              <p className="mt-1 text-sm text-slate-600 sm:text-base">How's your voice today?</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Online
              </span>
            </div>

            <div className="hidden max-w-[190px] shrink-0 text-right sm:block">
              <p className="text-lg font-bold leading-tight text-slate-900">Good conversations</p>
              <p className="mt-1 text-sm leading-5 text-slate-600">Create a better world <span aria-hidden="true">💙</span></p>
            </div>
          </div>
        </section>

        {/* Stories */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-950">Your Story</h2>
            <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">
              See All <ArrowRight size={16} />
            </Link>
          </div>
          <div className="rounded-3xl bg-white/70 p-1 shadow-sm ring-1 ring-slate-100">
            <StoriesBar />
          </div>
        </section>

        {/* Promotional banner */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-[#11134d] via-[#24206e] to-[#42157c] p-6 text-white shadow-[0_16px_45px_rgba(31,24,96,0.24)] sm:p-8">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-fuchsia-500/25 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 h-24 w-72 rounded-[50%] bg-indigo-400/20 blur-2xl" />
          <div className="relative z-10 max-w-xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">
              <Sparkles size={15} /> VoiceID experience
            </div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">More Than Messages</h2>
            <p className="mt-1 text-base font-medium text-indigo-100 sm:text-lg">A private space for your voice</p>
            <p className="mt-2 text-sm text-indigo-200">Chat · Create Rooms · Share Moments · Be Yourself</p>
            <Link
              to="/dashboard/rooms"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Explore Now <ArrowRight size={17} />
            </Link>
          </div>
          <div className="absolute bottom-[-55px] right-[-10px] hidden h-56 w-56 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/70 to-cyan-400/20 sm:flex">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur">
              <Mic size={58} strokeWidth={1.6} />
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-950">Quick Actions</h2>
            <Link to="/dashboard/search" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">
              View All <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.label} to={action.path} className="group text-center">
                  <div className={`relative mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br ${action.gradient} text-white shadow-lg transition-transform group-hover:-translate-y-1 group-active:scale-95 sm:h-[72px] sm:w-[72px]`}>
                    <Icon size={29} strokeWidth={2.2} />
                    {!!action.badge && action.badge > 0 && (
                      <span className="absolute -right-1 -top-2 flex min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 py-1 text-[10px] font-bold text-white ring-2 ring-[#f7f8ff]">
                        {action.badge > 99 ? '99+' : action.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold text-slate-800 sm:text-sm">{action.label}</p>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Two feature cards */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Link to="/dashboard/rooms" className="group flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex -space-x-3">
              {[0, 1, 2].map((n) => (
                <div key={n} className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-indigo-400 to-fuchsia-500 text-white shadow-sm">
                  <Users size={19} />
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-extrabold text-slate-950">Join Rooms</h3>
              <p className="text-sm text-slate-500">Meet new people in voice rooms</p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white">
              <ArrowRight size={18} />
            </span>
          </Link>

          <Link to="/store" className="group flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg">
              <ShoppingBag size={23} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-extrabold text-slate-950">VoiceID Store</h3>
              <p className="text-sm text-slate-500">Explore useful products & support creators</p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600 transition group-hover:bg-violet-600 group-hover:text-white">
              <ArrowRight size={18} />
            </span>
          </Link>
        </section>

        {/* Trending creator rooms */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-950">Trending Rooms</h2>
              <span aria-hidden="true">🔥</span>
            </div>
            <Link to="/dashboard/rooms" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700">
              See All <ArrowRight size={16} />
            </Link>
          </div>

          {loading ? (
            <div className="flex gap-3 overflow-hidden">
              {[0, 1, 2, 3].map((n) => <div key={n} className="h-44 min-w-[190px] animate-pulse rounded-3xl bg-slate-200" />)}
            </div>
          ) : featuredRooms.length > 0 ? (
            <div className="flex snap-x gap-3 overflow-x-auto pb-2 scrollbar-none">
              {featuredRooms.map((room, index) => (
                <Link
                  key={room.id}
                  to={`/dashboard/rooms/${room.id}`}
                  className={`relative min-w-[205px] snap-start overflow-hidden rounded-3xl bg-gradient-to-br ${roomGradients[index % roomGradients.length]} p-4 text-white shadow-lg sm:min-w-[220px]`}
                >
                  {room.cover_url && (
                    <img src={room.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" loading="lazy" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <div className="relative flex min-h-40 flex-col justify-end">
                    <div className="mb-auto flex items-start justify-between">
                      <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold backdrop-blur">{room.category || 'General'}</span>
                      {room.is_featured && <span className="rounded-full bg-amber-400/90 p-1.5 text-slate-950"><Sparkles size={12} /></span>}
                    </div>
                    <h3 className="line-clamp-1 text-lg font-extrabold">{room.name}</h3>
                    <p className="mt-1 flex items-center gap-1 text-xs text-white/85">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" /> {room.member_count} online
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Link to="/dashboard/rooms" className="flex items-center gap-4 rounded-3xl bg-white p-5 text-slate-700 shadow-sm ring-1 ring-slate-100">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Compass size={24} /></div>
              <div className="flex-1"><p className="font-bold text-slate-950">Discover your first room</p><p className="text-sm text-slate-500">Explore public and creator rooms.</p></div>
              <ArrowRight size={19} />
            </Link>
          )}
        </section>

        {/* Small voice-first CTA */}
        <Link to="/dashboard/rooms" className="group flex items-center gap-4 rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white shadow-[0_12px_30px_rgba(79,70,229,0.22)]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><Headphones size={24} /></div>
          <div className="flex-1"><p className="font-extrabold">Your voice deserves a room.</p><p className="text-sm text-indigo-100">Start talking, listening and connecting.</p></div>
          <ArrowRight className="transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
