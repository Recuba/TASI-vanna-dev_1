'use client';

import { cn } from '@/lib/utils';

type ConnectionStatus = 'live' | 'reconnecting' | 'offline';

export function ConnectionStatusBadge({ status, lang = 'ar' }: { status: ConnectionStatus; lang?: 'ar' | 'en' }) {
  const labels: Record<ConnectionStatus, Record<'ar' | 'en', string>> = {
    live: { ar: 'مباشر', en: 'Live' },
    reconnecting: { ar: 'جارٍ إعادة الاتصال', en: 'Reconnecting' },
    offline: { ar: 'غير متصل', en: 'Offline' },
  };
  return (
    <span role="status" aria-live="polite" className={cn(
      'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
      status === 'live' && 'bg-accent-green/20 text-accent-green',
      status === 'reconnecting' && 'bg-amber-500/20 text-amber-300',
      status === 'offline' && 'bg-accent-red/20 text-accent-red',
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        status === 'live' && 'bg-accent-green animate-pulse',
        status === 'reconnecting' && 'bg-amber-400',
        status === 'offline' && 'bg-accent-red',
      )} />
      {labels[status][lang]}
    </span>
  );
}
