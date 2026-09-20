import { Link } from 'react-router-dom';
import { Heart, Tag } from 'lucide-react';
import type { StoreProductSummary } from '../../hooks/useAffiliateStore';

function formatPrice(amount: number | null, currency: string) {
  if (amount == null) return null;
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${amount % 1 === 0 ? amount : amount.toFixed(2)}`;
}

export default function ProductCard({
  product,
  compact = false,
}: {
  product: StoreProductSummary;
  compact?: boolean;
}) {
  const discount =
    product.original_price && product.price && product.original_price > product.price
      ? Math.round((1 - product.price / product.original_price) * 100)
      : null;

  return (
    <Link
      to={`/store/${product.slug}`}
      className={`group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_5px_20px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_14px_35px_rgba(79,70,229,0.12)] ${
        compact ? 'rounded-[22px]' : ''
      }`}
    >
      <div className="relative aspect-square overflow-hidden bg-slate-50">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <Tag size={30} />
          </div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          {discount ? (
            <span className="rounded-full bg-slate-950 px-2 py-1 text-[9px] font-extrabold text-white shadow-sm">
              {discount}% OFF
            </span>
          ) : (
            <span />
          )}
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm backdrop-blur transition group-hover:text-rose-500"
            aria-hidden="true"
          >
            <Heart size={15} />
          </span>
        </div>
      </div>

      <div className={`${compact ? 'p-3' : 'p-3.5'} flex flex-1 flex-col`}>
        {product.merchant_name && (
          <p className="mb-1 truncate text-[9px] font-extrabold uppercase tracking-[0.12em] text-indigo-500">
            {product.merchant_name}
          </p>
        )}
        <p className="line-clamp-2 text-[13px] font-extrabold leading-[1.35] text-slate-900">
          {product.title}
        </p>

        {!compact && product.short_description && (
          <p className="mt-1.5 line-clamp-1 text-[11px] font-medium text-slate-400">
            {product.short_description}
          </p>
        )}

        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-baseline gap-1.5">
            {formatPrice(product.price, product.currency) && (
              <span className="text-[16px] font-black tracking-tight text-slate-950">
                {formatPrice(product.price, product.currency)}
              </span>
            )}
            {product.original_price && product.price && product.original_price > product.price && (
              <span className="text-[10px] font-semibold text-slate-400 line-through">
                {formatPrice(product.original_price, product.currency)}
              </span>
            )}
          </div>
          <span className="mt-2 inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-[9px] font-extrabold text-indigo-600">
            View deal →
          </span>
        </div>
      </div>
    </Link>
  );
}
