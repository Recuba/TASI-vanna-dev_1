'use client';

import { useState, useCallback } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { CommandPalette } from '@/components/common/CommandPalette';
import { MobileBottomNav } from '@/components/common/MobileBottomNav';
import { ToastProvider } from '@/components/common/Toast';
import { LiveMarketWidgets } from '@/components/widgets/LiveMarketWidgets';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import { useLanguage } from '@/providers/LanguageProvider';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { language } = useLanguage();

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((prev) => !prev);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <Header onToggleMobileSidebar={toggleMobileSidebar} />
        <LiveMarketWidgets lang={language} />
        <div className="flex flex-1">
          <Sidebar
            mobileOpen={mobileSidebarOpen}
            onMobileClose={closeMobileSidebar}
          />
          <main id="main-content" className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
            <OfflineBanner />
            {children}
          </main>
        </div>
        <Footer />
        <CommandPalette />
        <MobileBottomNav />
      </div>
    </ToastProvider>
  );
}
