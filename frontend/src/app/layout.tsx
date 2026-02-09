import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AuthProvider } from '@/lib/hooks/use-auth';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { Footer } from '@/components/layout/Footer';

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body
        className={`${ibmPlexArabic.variable} ${inter.variable} font-arabic antialiased`}
      >
        <ThemeProvider>
          <AuthProvider>
            <div className="min-h-screen flex flex-col">
              <Header />
              <div className="flex flex-1">
                <Sidebar />
                <main className="flex-1 flex flex-col min-w-0">
                  <ErrorBoundary>
                    {children}
                  </ErrorBoundary>
                </main>
              </div>
              <Footer />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
