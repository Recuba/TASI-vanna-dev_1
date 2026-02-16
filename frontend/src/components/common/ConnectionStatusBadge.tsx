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
    <span className={cn(
      'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
      status === 'live' && 'bg-emerald-500/20 text-emerald-300',
      status === 'reconnecting' && 'bg-amber-500/20 text-amber-300',
      status === 'offline' && 'bg-rose-500/20 text-rose-300',
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        status === 'live' && 'bg-emerald-400 animate-pulse',
        status === 'reconnecting' && 'bg-amber-400',
        status === 'offline' && 'bg-rose-400',
      )} />
      {labels[status][lang]}
    </span>
  );
}
