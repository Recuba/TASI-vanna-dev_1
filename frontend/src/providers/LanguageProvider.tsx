'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Language = 'ar' | 'en';

interface LanguageContextValue {
  language: Language;
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
  t: (ar: string, en: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const STORAGE_KEY = 'rad-ai-lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLangState] = useState<Language>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === 'ar' || stored === 'en') {
      setLangState(stored);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.setAttribute('lang', language);
    root.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    document.body.style.fontFamily =
      language === 'ar'
        ? 'var(--font-arabic), sans-serif'
        : 'var(--font-english), sans-serif';
    localStorage.setItem(STORAGE_KEY, language);
  }, [language, mounted]);

  const toggleLanguage = useCallback(() => {
    setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLangState(lang);
  }, []);

  const t = useCallback(
    (ar: string, en: string) => (language === 'ar' ? ar : en),
    [language],
  );

  const isRTL = language === 'ar';

  return (
    <LanguageContext.Provider
      value={{ language, toggleLanguage, setLanguage, t, isRTL }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
