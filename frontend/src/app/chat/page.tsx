'use client';

import { AIChatInterface } from '@/components/chat/AIChatInterface';

export default function ChatPage() {
  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)]">
      <AIChatInterface />
    </div>
  );
}
