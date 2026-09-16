import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const STORE_CATEGORIES = [
  'Electronics', 'Mobile', 'Accessories', 'Audio', 'Gaming',
  'Creator Tools', 'Software', 'AI Tools', 'Education', 'Hosting', 'Other',
] as const;

export interface StoreProductSummary {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  image_url: string | null;
  price: number | null;
  original_price: number | null;
  currency: string;
  brand: string | null;
  category: string | null;
  merchant_name: string | null;
  is_featured: boolean;
  click_count: number;
}

export interface StoreProductDetail extends StoreProductSummary {
  description: string | null;
  affiliate_url: string;
  affiliate_network: string;
}

const PAGE_SIZE = 20;

/** Product listing for the Store home page: search, category, section (featured/popular/latest), paginated. */
export function useStoreProducts(opts: { category?: string; search?: string; section?: 'featured' | 'popular' | 'latest' }) {
  const { category, search, section } = opts;
  const [products, setProducts] = useState<StoreProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    const { data, error } = await supabase.rpc('list_store_products', {
      p_category: category || null,
      p_search: search?.trim() || null,
      p_section: section || null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) {
      console.error('Failed to load store products:', error);
      if (!append) setProducts([]);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    const rows: StoreProductSummary[] = data ?? [];
    setProducts(prev => append ? [...prev, ...rows] : rows);
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
    setLoadingMore(false);
  }, [category, search, section]);

  useEffect(() => { load(0, false); }, [load]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    load(products.length, true);
  }, [load, loadingMore, hasMore, products.length]);

  return { products, loading, loadingMore, hasMore, loadMore, refresh: () => load(0, false) };
}

export function useStoreProduct(slug: string | undefined) {
  const [product, setProduct] = useState<StoreProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    supabase.from('affiliate_products').select('*').eq('slug', slug).eq('is_active', true).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('Failed to load product:', error);
        if (!data) setNotFound(true);
        setProduct(data);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  return { product, loading, notFound };
}

/** View/click tracking — works for logged-out visitors too (user_id is nullable and RLS allows anonymous inserts). */
export function useStoreTracking() {
  const { user } = useAuth();

  const logView = useCallback((productId: string, source?: string) => {
    void supabase.from('store_events').insert({ product_id: productId, user_id: user?.id ?? null, event_type: 'product_view', source });
  }, [user]);

  const logClickAndGetUrl = useCallback(async (productId: string, affiliateUrl: string, source?: string) => {
    // Best-effort: don't block the redirect on the tracking write.
    void supabase.from('store_events').insert({ product_id: productId, user_id: user?.id ?? null, event_type: 'affiliate_click', source });
    return affiliateUrl;
  }, [user]);

  return { logView, logClickAndGetUrl };
}
