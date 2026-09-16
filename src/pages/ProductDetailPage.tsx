import { useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Tag, ShoppingBag } from 'lucide-react';
import { useStoreProduct, useStoreTracking } from '../hooks/useAffiliateStore';

function formatPrice(amount: number | null, currency: string) {
  if (amount == null) return null;
  const symbol = currency === 'INR' ? '\u20b9' : currency === 'USD' ? '$' : currency + ' ';
  return `${symbol}${amount % 1 === 0 ? amount : amount.toFixed(2)}`;
}

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { product, loading, notFound } = useStoreProduct(slug);
  const { logView, logClickAndGetUrl } = useStoreTracking();
  const viewedRef = useRef<string | null>(null);

  useEffect(() => {
    if (product && viewedRef.current !== product.id) {
      viewedRef.current = product.id;
      logView(product.id, 'product_detail');
    }
  }, [product, logView]);

  const handleViewDeal = async () => {
    if (!product) return;
    const url = await logClickAndGetUrl(product.id, product.affiliate_url, 'product_detail');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 animate-pulse space-y-4">
        <div className="aspect-square bg-gray-100 rounded-2xl" />
        <div className="h-5 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center py-20 text-gray-500">
        <ShoppingBag className="mx-auto mb-3 text-gray-300" size={40} />
        <p>Yeh product nahi mila.</p>
        <Link to="/store" className="text-blue-600 text-sm mt-2 inline-block">Store par wapas jayein</Link>
      </div>
    );
  }

  const discount = product.original_price && product.price && product.original_price > product.price
    ? Math.round((1 - product.price / product.original_price) * 100)
    : null;

  return (
    <div className="max-w-2xl mx-auto pb-28">
      <div className="flex items-center gap-3 p-4">
        <Link to="/store" className="text-gray-600" aria-label="Back to Store">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-semibold text-gray-900 truncate">Product Details</h1>
      </div>

      <div className="px-4">
        <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden relative">
          {product.image_url ? (
            <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <Tag size={40} />
            </div>
          )}
          {discount && (
            <span className="absolute top-3 left-3 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-lg">
              {discount}% OFF
            </span>
          )}
        </div>

        <div className="mt-4">
          {product.category && <span className="text-xs text-blue-600 font-medium">{product.category}</span>}
          <h2 className="text-xl font-bold text-gray-900 mt-1">{product.title}</h2>
          {product.brand && <p className="text-sm text-gray-500 mt-0.5">by {product.brand}</p>}

          <div className="flex items-baseline gap-2 mt-3">
            {formatPrice(product.price, product.currency) && (
              <span className="text-2xl font-bold text-gray-900">{formatPrice(product.price, product.currency)}</span>
            )}
            {product.original_price && product.price && product.original_price > product.price && (
              <span className="text-sm text-gray-400 line-through">{formatPrice(product.original_price, product.currency)}</span>
            )}
          </div>

          {product.merchant_name && <p className="text-xs text-gray-400 mt-1">Sold via {product.merchant_name}</p>}

          {product.description && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Description</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{product.description}</p>
            </div>
          )}

          <p className="text-[11px] text-gray-400 mt-6 leading-relaxed">
            Yeh ek affiliate link hai. Is link se kharidne par VoiceID ko bina kisi extra cost ke commission mil sakta hai. VoiceID payment ya delivery handle nahi karta — aap seedha merchant ki website par jayenge.
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] max-w-2xl mx-auto">
        <button
          onClick={handleViewDeal}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 text-white rounded-full font-semibold"
        >
          <ExternalLink size={18} /> View Deal
        </button>
      </div>
    </div>
  );
}
