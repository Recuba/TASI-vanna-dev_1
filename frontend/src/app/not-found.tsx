import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center animate-fade-in-up">
        {/* Gold 404 number */}
        <div className="mb-6">
          <span className="text-8xl font-bold gold-text">404</span>
        </div>

        {/* Arabic heading */}
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
          الصفحة غير موجودة
        </h1>

        {/* Description */}
        <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
          عذرا، لم نتمكن من العثور على الصفحة التي تبحث عنها. قد تكون قد حذفت أو نقلت.
        </p>

        {/* Return home button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-gold text-[#0E0E0E] font-medium px-6 py-3 rounded-xl hover:bg-gold-light hover:gold-glow-sm transition-all duration-300"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          العودة للرئيسية
        </Link>

        {/* Decorative gold line */}
        <div className="mt-10 mx-auto w-24 h-0.5 bg-gold-gradient rounded-full opacity-50" />
      </div>
    </div>
  );
}
