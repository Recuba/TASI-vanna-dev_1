'use client';

import { Suspense } from 'react';
import { AIChatInterface } from '@/components/chat/AIChatInterface';

function ChatContent() {
  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)]">
      <AIChatInterface />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><span className="text-[var(--text-muted)]">...</span></div>}>
      <ChatContent />
    </Suspense>
  );
}
