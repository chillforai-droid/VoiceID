import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Gift,
  Heart,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useStoreProducts, STORE_CATEGORIES } from '../hooks/useAffiliateStore';
import ProductCard from '../components/store/ProductCard';

function SkeletonCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'w-40 shrink-0' : ''}>
      <div className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-sm">
        <div className="aspect-square animate-pulse bg-slate-100" />
        <div className="space-y-2 p-3.5">
          <div className="h-3.5 w-4/5 animate-pulse rounded-full bg-slate-100" />
          <div className="h-3 w-3/5 animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-2/5 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function ProductRow({
  title,
  subtitle,
  icon,
  section,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  section: 'featured' | 'popular' | 'latest';
}) {
  const { products, loading } = useStoreProducts({ section });
  if (!loading && products.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between px-1">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              {icon}
            </span>
            <h2 className="text-[18px] font-extrabold tracking-tight text-slate-950">{title}</h2>
          </div>
          <p className="pl-10 text-xs font-medium text-slate-400">{subtitle}</p>
        </div>
        <Link to="/store" className="flex items-center gap-0.5 text-xs font-bold text-indigo-600">
          See all <ChevronRight size={15} />
        </Link>
      </div>

      <div className="scrollbar-none flex gap-3 overflow-x-auto pb-2">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} compact />)
          : products.slice(0, 10).map((product) => (
              <div key={product.id} className="w-40 shrink-0 sm:w-44">
                <ProductCard product={product} compact />
              </div>
            ))}
      </div>
    </section>
  );
}

export default function StorePage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState<string | undefined>();

  const { products, loading, loadingMore, hasMore, loadMore } = useStoreProducts({
    category,
    search,
  });

  const browsing = Boolean(search || category);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearch('');
    setSearchInput('');
    setCategory(undefined);
  };

  return (
    <div className="min-h-full bg-[#f7f8ff]">
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        {/* Store header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">
              VoiceID
            </p>
            <h1 className="text-[28px] font-black tracking-tight text-slate-950 sm:text-[32px]">
              Store
            </h1>
          </div>
          <Link
            to="/dashboard"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-indigo-600"
            aria-label="VoiceID Home"
          >
            <ShoppingBag size={21} />
          </Link>
        </div>

        {/* Hero */}
        <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-indigo-600 via-blue-600 to-violet-600 p-5 text-white shadow-[0_18px_45px_rgba(79,70,229,0.20)] sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-48 w-48 rounded-full bg-fuchsia-400/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold backdrop-blur">
              <Sparkles size={13} />
              Curated for VoiceID
            </div>
            <h2 className="max-w-xl text-[27px] font-black leading-[1.08] tracking-tight sm:text-[36px]">
              Discover products you’ll love.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-white/80">
              Explore useful tech, creator tools, AI services and everyday deals in one place.
            </p>

            <form onSubmit={submitSearch} className="mt-5 flex max-w-xl items-center rounded-2xl bg-white p-1.5 shadow-xl">
              <Search className="ml-2.5 shrink-0 text-slate-400" size={19} />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search products, brands & tools..."
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                aria-label="Search products"
              />
              <button
                type="submit"
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
              >
                Search
              </button>
            </form>
          </div>
        </section>

        {/* Categories */}
        <section className="mt-5">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900">Shop by category</h2>
            {browsing && (
              <button onClick={clearFilters} className="text-xs font-bold text-indigo-600">
                Clear
              </button>
            )}
          </div>
          <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCategory(undefined)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                !category
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
              }`}
            >
              All
            </button>
            {STORE_CATEGORIES.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                  category === item
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {/* Curated rows */}
        {!browsing && (
          <>
            <ProductRow
              title="Featured picks"
              subtitle="Hand-picked deals and useful products"
              icon={<Gift size={16} />}
              section="featured"
            />
            <ProductRow
              title="Trending now"
              subtitle="Popular with the VoiceID community"
              icon={<TrendingUp size={16} />}
              section="popular"
            />
            <ProductRow
              title="Fresh arrivals"
              subtitle="Recently added to the Store"
              icon={<Clock3 size={16} />}
              section="latest"
            />
          </>
        )}

        {/* Main product grid */}
        <section className={`${!browsing ? 'mt-9' : 'mt-7'}`}>
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <h2 className="text-[19px] font-extrabold tracking-tight text-slate-950">
                {browsing ? (category || 'Search results') : 'All products'}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                {browsing ? 'Find the right deal for you' : 'More things worth discovering'}
              </p>
            </div>
            <span className="hidden rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500 shadow-sm sm:block">
              {category || 'All categories'}
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-400">
                <ShoppingBag size={28} />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">No products found</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
                Try another search or choose a different category.
              </p>
              {browsing && (
                <button
                  onClick={clearFilters}
                  className="mt-5 rounded-full bg-slate-950 px-5 py-2.5 text-xs font-bold text-white"
                >
                  Browse all products
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {hasMore && (
                <div className="mt-7 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading...' : 'Load more'}
                    {!loadingMore && <ArrowRight size={14} />}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Trust / affiliate disclosure */}
        <div className="mt-9 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
            <Zap size={18} className="mb-2 text-indigo-600" />
            <p className="text-xs font-extrabold text-slate-900">Curated deals</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">Useful products selected for the VoiceID community.</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
            <Tag size={18} className="mb-2 text-indigo-600" />
            <p className="text-xs font-extrabold text-slate-900">Clear pricing</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">See available price and discount information before visiting the merchant.</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
            <Heart size={18} className="mb-2 text-indigo-600" />
            <p className="text-xs font-extrabold text-slate-900">Supports VoiceID</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">Some links are affiliate links and may earn VoiceID a commission at no extra cost to you.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
