import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Search, ShoppingBag, RotateCcw, Home } from 'lucide-react';
import { useStoreProducts, STORE_CATEGORIES } from '../hooks/useAffiliateStore';
import ProductCard from '../components/store/ProductCard';

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden border border-gray-100">
          <div className="aspect-square bg-gray-100 animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductSection({ title, section }: { title: string; section: 'featured' | 'popular' | 'latest' }) {
  const { products, loading } = useStoreProducts({ section });
  if (!loading && products.length === 0) return null;
  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-2.5 px-4">{title}</h2>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-36 shrink-0 rounded-2xl overflow-hidden border border-gray-100">
              <div className="aspect-square bg-gray-100 animate-pulse" />
              <div className="p-2.5 h-12 bg-gray-50 animate-pulse" />
            </div>
          ))
        ) : (
          products.slice(0, 10).map(p => (
            <div key={p.id} className="w-36 shrink-0">
              <ProductCard product={p} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function StorePage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const { products, loading, loadingMore, hasMore, loadMore } = useStoreProducts({ category, search });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const browsing = !!search || !!category;

  return (
    <div className="max-w-5xl mx-auto p-4 pb-10">
      <div className="flex items-center justify-between mb-4">
        <Link to="/" className="flex items-center gap-1.5 text-gray-500 text-sm">
          <Home size={16} /> VoiceID
        </Link>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <ShoppingBag className="text-blue-600" size={24} />
        <h1 className="text-2xl font-bold text-gray-900">Store</h1>
      </div>

      <form onSubmit={handleSearchSubmit} className="relative mb-4">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Products search karein..."
          className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
        <button
          onClick={() => setCategory(undefined)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${!category ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          All
        </button>
        {STORE_CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${category === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {!browsing && (
        <>
          <ProductSection title="Featured Products" section="featured" />
          <ProductSection title="Popular Products" section="popular" />
          <ProductSection title="Latest Products" section="latest" />
          <h2 className="text-base font-semibold text-gray-900 mb-2.5">All Products</h2>
        </>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <ShoppingBag className="mx-auto mb-3 text-gray-300" size={40} />
          <p>Abhi koi product upalabdh nahi hai.</p>
          {browsing && (
            <button onClick={() => { setSearch(''); setSearchInput(''); setCategory(undefined); }} className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600">
              <RotateCcw size={14} /> Filters clear karein
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium disabled:opacity-50"
              >
                {loadingMore ? 'Load ho raha hai...' : 'Aur dikhayein'}
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-gray-400 text-center mt-10 px-6">
        Is Store me kuch links affiliate links ho sakte hain. Agar aap in links ke through kharidte hain, to VoiceID ko bina kisi extra cost ke commission mil sakta hai.
      </p>
    </div>
  );
}
