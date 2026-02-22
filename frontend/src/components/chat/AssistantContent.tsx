'use client';

import dynamic from 'next/dynamic';
import type { ChatMessage, SSEEvent, SSEProgressData, SSECodeData, SSETableData, SSEChartData, SSETextData } from '@/lib/types';
import { DataTable } from './DataTable';
import { LoadingDots } from './LoadingDots';

const SQLBlock = dynamic(() => import('./SQLBlock').then((m) => m.SQLBlock), {
  loading: () => <div className="h-16 rounded-lg bg-[var(--bg-input)] animate-pulse" />,
});
const ChartBlock = dynamic(() => import('./ChartBlock').then((m) => m.ChartBlock), {
  ssr: false,
  loading: () => <div className="h-[400px] rounded-lg bg-[var(--bg-input)] animate-pulse" />,
});
const ReactMarkdown = dynamic(() => import('react-markdown'), {
  loading: () => <div className="h-4 w-3/4 rounded bg-[var(--bg-input)] animate-pulse" />,
});

interface AssistantContentProps {
  message: ChatMessage;
  /** Live progress text from the SSE stream */
  progressText?: string;
}

export function AssistantContent({ message, progressText }: AssistantContentProps) {
  const { components, isStreaming, isError } = message;

  // While streaming with no components yet, show loading dots
  if ((!components || components.length === 0) && isStreaming) {
    return <LoadingDots progressText={progressText} />;
  }

  // Post-stream fallback: if components is empty and not an error,
  // show a helpful fallback so the user never sees an empty bubble
  if ((!components || components.length === 0) && !isStreaming && !isError) {
    const lang = typeof window !== 'undefined' ? localStorage.getItem('rad-ai-lang') : null;
    const fallbackText = lang === 'en'
      ? "I wasn't able to answer that. Try asking about a specific stock, sector, or metric."
      : 'عذرًا، لم أستطع الإجابة على هذا السؤال. جرّب السؤال عن سهم محدد أو قطاع.';
    return (
      <div className="text-sm leading-relaxed text-[var(--text-muted)] italic">
        {fallbackText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {components?.map((event, i) => (
        <EventBlock key={i} event={event} />
      ))}
      {isStreaming && <LoadingDots progressText={progressText} />}
    </div>
  );
}

function EventBlock({ event }: { event: SSEEvent }) {
  switch (event.type) {
    case 'progress':
      return <ProgressBlock data={event.data as SSEProgressData} />;
    case 'code':
      return <SQLBlock data={event.data as SSECodeData} />;
    case 'table':
      return <DataTable data={event.data as SSETableData} />;
    case 'chart':
      return <ChartBlock data={event.data as SSEChartData} />;
    case 'text':
      return <TextBlock data={event.data as SSETextData} />;
    default:
      return null;
  }
}

function ProgressBlock({ data }: { data: SSEProgressData }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] italic">
      <span className="w-1.5 h-1.5 bg-gold rounded-full animate-gold-pulse" />
      {data.message}
    </div>
  );
}

function TextBlock({ data }: { data: SSETextData }) {
  return (
    <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:text-[var(--text-primary)] prose-a:text-gold">
      <ReactMarkdown>{data.content}</ReactMarkdown>
    </div>
  );
}
