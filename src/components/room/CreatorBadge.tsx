import { BadgeCheck } from 'lucide-react';

export default function CreatorBadge({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold shrink-0">
      <BadgeCheck size={size} /> Creator
    </span>
  );
}
