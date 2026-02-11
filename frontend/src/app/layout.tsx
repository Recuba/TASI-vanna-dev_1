import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { LanguageProvider } from '@/providers/LanguageProvider';
import { AuthProvider } from '@/lib/hooks/use-auth';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { GlobalKeyboardShortcuts } from '@/components/common/GlobalKeyboardShortcuts';
import { ScrollToTop } from '@/components/common/ScrollToTop';
import { AppShell } from '@/components/layout/AppShell';

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-english',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Ra'd AI - Saudi Stock Market AI Analyst",
  description:
    'AI-powered Saudi stock market analysis. Query TASI data with natural language.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="dark" suppressHydrationWarning>
      <body
        className={`${ibmPlexArabic.variable} ${inter.variable} font-english antialiased`}
      >
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <GlobalKeyboardShortcuts />
              <ScrollToTop />
              <AppShell>
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </AppShell>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
