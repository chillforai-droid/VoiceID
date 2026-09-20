import { Link } from 'react-router-dom';
import { Tag } from 'lucide-react';
import type { StoreProductSummary } from '../../hooks/useAffiliateStore';

function formatPrice(amount: number | null, currency: string) {
  if (amount == null) return null;
  const symbol = currency === 'INR' ? '\u20b9' : currency === 'USD' ? '$' : currency + ' ';
  return `${symbol}${amount % 1 === 0 ? amount : amount.toFixed(2)}`;
}

export default function ProductCard({ product }: { product: StoreProductSummary }) {
  const discount = product.original_price && product.price && product.original_price > product.price
    ? Math.round((1 - product.price / product.original_price) * 100)
    : null;

  return (
    <Link
      to={`/store/${product.slug}`}
      className="flex flex-col bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:border-blue-200 transition-colors"
    >
      <div className="aspect-square bg-gray-50 relative">
        {product.image_url ? (
          <img src={product.image_url} alt={product.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <Tag size={28} />
          </div>
        )}
        {discount && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-md">
            {discount}% OFF
          </span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">{product.title}</p>
        {product.short_description && (
          <p className="text-xs text-gray-500 line-clamp-1 mb-2">{product.short_description}</p>
        )}
        <div className="mt-auto flex items-baseline gap-1.5">
          {formatPrice(product.price, product.currency) && (
            <span className="text-base font-bold text-gray-900">{formatPrice(product.price, product.currency)}</span>
          )}
          {product.original_price && product.price && product.original_price > product.price && (
            <span className="text-xs text-gray-400 line-through">{formatPrice(product.original_price, product.currency)}</span>
          )}
        </div>
        {product.merchant_name && <p className="text-[10px] text-gray-400 mt-0.5">{product.merchant_name}</p>}
      </div>
    </Link>
  );
}
