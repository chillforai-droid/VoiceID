import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Tag,
  ShoppingBag,
} from 'lucide-react';

import {
  useStoreProduct,
  useStoreTracking,
} from '../hooks/useAffiliateStore';

function formatPrice(
  amount: number | null,
  currency: string
) {
  if (amount == null) return null;

  const symbol =
    currency === 'INR'
      ? '₹'
      : currency === 'USD'
        ? '$'
        : currency + ' ';

  return `${symbol}${
    amount % 1 === 0
      ? amount
      : amount.toFixed(2)
  }`;
}

/**
 * Converts the stored affiliate URL into a valid
 * external http/https URL.
 *
 * This is important because an affiliate URL must NOT
 * be handled by React Router as an internal VoiceID route.
 */
function normalizeAffiliateUrl(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  let url = value.trim();

  if (!url) return null;

  // Example:
  // //example.com/product
  if (url.startsWith('//')) {
    url = `https:${url}`;
  }

  // Example:
  // www.example.com/product
  if (/^www\./i.test(url)) {
    url = `https://${url}`;
  }

  // Example:
  // example.com/product
  if (
    !/^https?:\/\//i.test(url) &&
    /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(url)
  ) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);

    // Only allow normal web URLs.
    if (
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:'
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export default function ProductDetailPage() {
  const { slug } = useParams<{
    slug: string;
  }>();

  const {
    product,
    loading,
    notFound,
  } = useStoreProduct(slug);

  const {
    logView,
    logClickAndGetUrl,
  } = useStoreTracking();

  const viewedRef = useRef<string | null>(null);

  const [dealLoading, setDealLoading] =
    useState(false);

  /*
   * Track product view only once.
   */
  useEffect(() => {
    if (
      product &&
      viewedRef.current !== product.id
    ) {
      viewedRef.current = product.id;

      logView(
        product.id,
        'product_detail'
      );
    }
  }, [product, logView]);

  /*
   * View Deal / Affiliate redirect
   */
  const handleViewDeal = async () => {
    if (!product || dealLoading) {
      return;
    }

    /*
     * Get the affiliate URL stored in the product.
     */
    const affiliateUrl =
      normalizeAffiliateUrl(
        product.affiliate_url
      );

    /*
     * No valid affiliate URL.
     */
    if (!affiliateUrl) {
      window.alert(
        'इस product का valid referral/deal link उपलब्ध नहीं है। कृपया Admin Panel में affiliate URL check करें।'
      );

      return;
    }

    /*
     * IMPORTANT:
     *
     * Open the tab immediately while this function
     * is still running from the user's click.
     *
     * If window.open() is called only AFTER an
     * async Supabase request, Chrome may block it
     * as a popup.
     */
    const dealWindow =
      window.open(
        '',
        '_blank'
      );

    setDealLoading(true);

    try {
      /*
       * Track the click.
       *
       * If your hook returns a converted Cuelinks
       * URL, we use that URL.
       *
       * If tracking fails, the original affiliate
       * URL is still used.
       */
      const finalUrl =
        await logClickAndGetUrl(
          product.id,
          affiliateUrl,
          'product_detail'
        );

      /*
       * Validate the URL returned from tracking.
       */
      const safeUrl =
        normalizeAffiliateUrl(
          finalUrl
        ) || affiliateUrl;

      /*
       * If popup opened successfully,
       * navigate that popup to affiliate URL.
       */
      if (
        dealWindow &&
        !dealWindow.closed
      ) {
        dealWindow.location.href =
          safeUrl;
      } else {
        /*
         * Popup blocked by browser.
         *
         * Fallback:
         * open affiliate URL in current tab.
         */
        window.location.assign(
          safeUrl
        );
      }
    } catch (error) {
      console.error(
        'Failed to open affiliate deal:',
        error
      );

      /*
       * Even if click tracking fails,
       * NEVER block the user's deal.
       *
       * Send user directly to the original
       * affiliate URL.
       */
      if (
        dealWindow &&
        !dealWindow.closed
      ) {
        dealWindow.location.href =
          affiliateUrl;
      } else {
        window.location.assign(
          affiliateUrl
        );
      }
    } finally {
      setDealLoading(false);
    }
  };

  /*
   * Loading state
   */
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 animate-pulse space-y-4">
        <div className="aspect-square bg-gray-100 rounded-2xl" />

        <div className="h-5 bg-gray-100 rounded w-3/4" />

        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>
    );
  }

  /*
   * Product not found
   */
  if (notFound || !product) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center py-20 text-gray-500">

        <ShoppingBag
          className="mx-auto mb-3 text-gray-300"
          size={40}
        />

        <p>
          Yeh product nahi mila.
        </p>

        <Link
          to="/store"
          className="text-blue-600 text-sm mt-2 inline-block"
        >
          Store par wapas jayein
        </Link>

      </div>
    );
  }

  /*
   * Calculate discount percentage.
   */
  const discount =
    product.original_price &&
    product.price &&
    product.original_price >
      product.price
      ? Math.round(
          (
            1 -
            product.price /
              product.original_price
          ) * 100
        )
      : null;

  /*
   * Check affiliate URL before
   * enabling View Deal button.
   */
  const hasValidAffiliateUrl =
    Boolean(
      normalizeAffiliateUrl(
        product.affiliate_url
      )
    );

  return (
    <div className="max-w-2xl mx-auto pb-28">

      {/* =========================================
          HEADER
      ========================================== */}

      <div className="flex items-center gap-3 p-4">

        <Link
          to="/store"
          className="text-gray-600"
          aria-label="Back to Store"
        >
          <ArrowLeft size={20} />
        </Link>

        <h1 className="font-semibold text-gray-900 truncate">
          Product Details
        </h1>

      </div>

      {/* =========================================
          PRODUCT CONTENT
      ========================================== */}

      <div className="px-4">

        {/* Product Image */}

        <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden relative">

          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">

              <Tag size={40} />

            </div>
          )}

          {/* Discount Badge */}

          {discount && (
            <span className="absolute top-3 left-3 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-lg">
              {discount}% OFF
            </span>
          )}

        </div>

        {/* =========================================
            PRODUCT INFORMATION
        ========================================== */}

        <div className="mt-4">

          {/* Category */}

          {product.category && (
            <span className="text-xs text-blue-600 font-medium">
              {product.category}
            </span>
          )}

          {/* Title */}

          <h2 className="text-xl font-bold text-gray-900 mt-1">
            {product.title}
          </h2>

          {/* Brand */}

          {product.brand && (
            <p className="text-sm text-gray-500 mt-0.5">
              by {product.brand}
            </p>
          )}

          {/* Price */}

          <div className="flex items-baseline gap-2 mt-3">

            {formatPrice(
              product.price,
              product.currency
            ) && (
              <span className="text-2xl font-bold text-gray-900">
                {formatPrice(
                  product.price,
                  product.currency
                )}
              </span>
            )}

            {product.original_price &&
              product.price &&
              product.original_price >
                product.price && (
                <span className="text-sm text-gray-400 line-through">
                  {formatPrice(
                    product.original_price,
                    product.currency
                  )}
                </span>
              )}

          </div>

          {/* Merchant */}

          {product.merchant_name && (
            <p className="text-xs text-gray-400 mt-1">
              Sold via{' '}
              {product.merchant_name}
            </p>
          )}

          {/* Description */}

          {product.description && (
            <div className="mt-5">

              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
                Description
              </h3>

              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                {product.description}
              </p>

            </div>
          )}

          {/* Affiliate Disclosure */}

          <p className="text-[11px] text-gray-400 mt-6 leading-relaxed">
            Yeh ek affiliate link hai.
            Is link se kharidne par
            VoiceID ko bina kisi extra
            cost ke commission mil sakta hai.
            VoiceID payment ya delivery
            handle nahi karta — aap seedha
            merchant ki website par jayenge.
          </p>

          {/* Invalid URL Warning */}

          {!hasValidAffiliateUrl && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">

              Is product ka affiliate/deal
              URL valid nahi hai. Admin Panel
              me affiliate URL ko
              https:// se shuru hone wale
              complete URL ke roop me save
              karein.

            </p>
          )}

        </div>
      </div>

      {/* =========================================
          FIXED VIEW DEAL BUTTON
      ========================================== */}

      <div
        className="
          fixed
          bottom-0
          inset-x-0
          bg-white
          border-t
          border-gray-100
          p-4
          pb-[calc(1rem+env(safe-area-inset-bottom,0px))]
          max-w-2xl
          mx-auto
        "
      >

        <button
          type="button"
          onClick={handleViewDeal}
          disabled={
            dealLoading ||
            !hasValidAffiliateUrl
          }
          className="
            w-full
            flex
            items-center
            justify-center
            gap-2
            py-3.5
            bg-blue-600
            text-white
            rounded-full
            font-semibold
            disabled:opacity-50
            disabled:cursor-not-allowed
          "
        >

          <ExternalLink size={18} />

          {dealLoading
            ? 'Opening...'
            : 'View Deal'}

        </button>

      </div>

    </div>
  );
        }
