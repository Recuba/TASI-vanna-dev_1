import { cn } from '@/lib/utils';

export function Footer() {
  return (
    <footer
      className={cn(
        'text-center',
        'py-4 px-6',
        'border-t border-gold/[0.08]'
      )}
    >
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        Ra&apos;d AI
        <span className="inline-block mx-2 text-[var(--text-muted)]/40">|</span>
        Saudi Stock Market Intelligence
        <span className="inline-block mx-2 text-[var(--text-muted)]/40">|</span>
        Data sourced from Tadawul (TASI)
      </p>
    </footer>
  );
}
