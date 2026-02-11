'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/hooks/use-auth';
import { useLanguage } from '@/providers/LanguageProvider';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, guestLogin } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectTo = searchParams.get('redirect') || '/chat';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name || email);
      }
      router.push(redirectTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Try to parse JSON error from backend
      try {
        const parsed = JSON.parse(msg);
        setError(parsed.detail || msg);
      } catch {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestAccess = async () => {
    setError('');
    setLoading(true);
    try {
      await guestLogin();
      router.push(redirectTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8 min-h-[calc(100vh-4rem)]">
      <div
        className="w-full max-w-md space-y-6"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Logo / Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gold/10 border border-gold/20 mb-2">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gold">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {t('مرحبا بك في رعد', 'Welcome to Ra\'d AI')}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {t('منصة تحليل الأسهم السعودية بالذكاء الاصطناعي', 'AI-Powered Saudi Stock Market Analytics')}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-lg p-6 space-y-5">
          {/* Mode toggle */}
          <div className="flex rounded-md overflow-hidden border border-[#2A2A2A]">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={cn(
                'flex-1 py-2 text-sm font-medium transition-colors',
                mode === 'login'
                  ? 'bg-gold/20 text-gold'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              {t('تسجيل الدخول', 'Sign In')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={cn(
                'flex-1 py-2 text-sm font-medium transition-colors',
                mode === 'register'
                  ? 'bg-gold/20 text-gold'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              {t('حساب جديد', 'Register')}
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  {t('الاسم', 'Name')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('أدخل اسمك', 'Enter your name')}
                  className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[#2A2A2A] rounded-md px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t('البريد الإلكتروني', 'Email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('أدخل بريدك الإلكتروني', 'Enter your email')}
                required
                className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[#2A2A2A] rounded-md px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t('كلمة المرور', 'Password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register'
                  ? t('8 أحرف على الأقل', 'At least 8 characters')
                  : t('أدخل كلمة المرور', 'Enter your password')
                }
                required
                minLength={mode === 'register' ? 8 : undefined}
                className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[#2A2A2A] rounded-md px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold transition-colors"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-2.5 rounded-md text-sm font-medium transition-colors',
                'bg-gold text-[#0E0E0E]',
                'hover:bg-gold-light',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading
                ? t('جاري التحميل...', 'Loading...')
                : mode === 'login'
                  ? t('تسجيل الدخول', 'Sign In')
                  : t('إنشاء حساب', 'Create Account')
              }
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#2A2A2A]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-[var(--bg-card)] text-[var(--text-muted)]">
                {t('أو', 'or')}
              </span>
            </div>
          </div>

          {/* Guest Access */}
          <button
            type="button"
            onClick={handleGuestAccess}
            disabled={loading}
            className={cn(
              'w-full py-2.5 rounded-md text-sm font-medium transition-colors',
              'bg-transparent border border-gold/30 text-gold',
              'hover:bg-gold/10',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {t('الدخول كزائر', 'Continue as Guest')}
          </button>

          <p className="text-center text-xs text-[var(--text-muted)]">
            {t(
              'يمكنك استخدام المنصة كزائر بدون تسجيل',
              'Use the platform without an account'
            )}
          </p>
        </div>

        {/* Back link */}
        <div className="text-center">
          <Link
            href="/"
            className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors"
          >
            {t('العودة للرئيسية', 'Back to Home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
