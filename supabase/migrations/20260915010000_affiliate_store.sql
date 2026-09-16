-- ============================================================
-- Affiliate Store — a product-discovery catalog, not a checkout.
-- "Buy"/"View Deal" always redirects to an external merchant URL;
-- VoiceID never handles payment or delivery.
--
-- Products are public routes (not under /dashboard) so logged-out
-- visitors can browse and clicks still get tracked for them — there is
-- no admin UI yet (deliberately, per spec), so products are managed by
-- direct SQL / a future standalone admin panel using the service role,
-- which bypasses RLS entirely.
-- ============================================================

CREATE TABLE public.affiliate_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    short_description TEXT,
    image_url TEXT,
    price NUMERIC(12, 2),
    original_price NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'INR',
    brand TEXT,
    category TEXT,
    merchant_name TEXT,
    affiliate_url TEXT NOT NULL,
    affiliate_network TEXT NOT NULL DEFAULT 'other' CHECK (affiliate_network IN ('cuelinks', 'amazon', 'impact', 'other')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_affiliate_products_active_sort ON public.affiliate_products(is_active, sort_order) WHERE is_active = TRUE;
CREATE INDEX idx_affiliate_products_category ON public.affiliate_products(category) WHERE is_active = TRUE;
CREATE INDEX idx_affiliate_products_featured ON public.affiliate_products(is_featured) WHERE is_featured = TRUE AND is_active = TRUE;
CREATE INDEX idx_affiliate_products_title_search ON public.affiliate_products USING gin (to_tsvector('english', title));

ALTER TABLE public.affiliate_products ENABLE ROW LEVEL SECURITY;

-- Public, read-only, active products only. Deliberately no INSERT/UPDATE/
-- DELETE policy at all: with RLS enabled and no matching policy, writes
-- are denied for every client role (anon and authenticated alike) — the
-- affiliate_url can only ever be changed via the service role.
CREATE POLICY "Active products are publicly readable" ON public.affiliate_products
    FOR SELECT USING (is_active = TRUE);

CREATE OR REPLACE FUNCTION public.touch_affiliate_product_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_affiliate_product_updated
BEFORE UPDATE ON public.affiliate_products
FOR EACH ROW EXECUTE FUNCTION public.touch_affiliate_product_updated_at();

-- ==========================================
-- Store analytics — product_view / affiliate_click. Anonymous-friendly
-- (user_id nullable) so logged-out browsing still gets tracked, since
-- /store is a public route outside the authenticated dashboard.
-- ==========================================
CREATE TABLE public.store_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES public.affiliate_products(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('product_view', 'affiliate_click')),
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_store_events_product_type_created ON public.store_events(product_id, event_type, created_at);

ALTER TABLE public.store_events ENABLE ROW LEVEL SECURITY;

-- Insert-only for clients (including anonymous — user_id IS NULL passes
-- since auth.uid() is also NULL for an unauthenticated request). No
-- SELECT policy: raw event rows are only readable via the service role
-- (future admin panel), not by any app user.
CREATE POLICY "Anyone can log a store event" ON public.store_events
    FOR INSERT WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- ==========================================
-- Store browsing RPC: search + category filter + pagination in one call,
-- so the client never needs broader read access than "active products".
-- ==========================================
CREATE OR REPLACE FUNCTION public.list_store_products(
  p_category TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_section TEXT DEFAULT NULL, -- 'featured' | 'popular' | 'latest' | NULL (all)
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID, title TEXT, slug TEXT, short_description TEXT, image_url TEXT,
  price NUMERIC, original_price NUMERIC, currency TEXT, brand TEXT, category TEXT,
  merchant_name TEXT, is_featured BOOLEAN, click_count BIGINT
) AS $$
  SELECT
    p.id, p.title, p.slug, p.short_description, p.image_url,
    p.price, p.original_price, p.currency, p.brand, p.category,
    p.merchant_name, p.is_featured,
    (SELECT COUNT(*) FROM public.store_events se WHERE se.product_id = p.id AND se.event_type = 'affiliate_click')
  FROM public.affiliate_products p
  WHERE p.is_active = TRUE
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_search IS NULL OR p.title ILIKE '%' || p_search || '%' OR p.brand ILIKE '%' || p_search || '%')
    AND (p_section IS NULL OR p_section != 'featured' OR p.is_featured = TRUE)
  ORDER BY
    CASE WHEN p_section = 'popular' THEN
      (SELECT COUNT(*) FROM public.store_events se WHERE se.product_id = p.id AND se.event_type = 'affiliate_click')
    END DESC NULLS LAST,
    CASE WHEN p_section = 'latest' OR p_section IS NULL THEN p.created_at END DESC NULLS LAST,
    p.sort_order ASC, p.created_at DESC
  LIMIT LEAST(p_limit, 50) OFFSET GREATEST(p_offset, 0);
$$ LANGUAGE sql STABLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'affiliate_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.affiliate_products;
  END IF;
END $$;
