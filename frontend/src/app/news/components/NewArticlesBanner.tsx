'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

export interface NewArticlesBannerProps {
  count: number;
  onDismiss: () => void;
}

export function NewArticlesBanner({ count, onDismiss }: NewArticlesBannerProps) {
  const { t } = useLanguage();

  if (count <= 0) return null;

  return (
    <div aria-live="polite" role="status">
      <button
        onClick={onDismiss}
        className={cn(
          'w-full py-2.5 px-4 rounded-lg text-sm font-medium',
          'bg-[#D4A84B]/15 text-[#D4A84B] border border-[#D4A84B]/30',
          'hover:bg-[#D4A84B]/25 transition-colors',
          'animate-pulse',
        )}
      >
        {t(`${count} أخبار جديدة - اضغط للتحديث`, `${count} new articles - tap to refresh`)}
      </button>
    </div>
  );
}
