'use client';

import type { ChatMessage, SSEEvent, SSEProgressData, SSECodeData, SSETableData, SSEChartData, SSETextData } from '@/lib/types';
import { SQLBlock } from './SQLBlock';
import { DataTable } from './DataTable';
import { ChartBlock } from './ChartBlock';
import { LoadingDots } from './LoadingDots';
import ReactMarkdown from 'react-markdown';

interface AssistantContentProps {
  message: ChatMessage;
}

export function AssistantContent({ message }: AssistantContentProps) {
  const { components, isStreaming } = message;

  if ((!components || components.length === 0) && isStreaming) {
    return <LoadingDots />;
  }

  return (
    <div className="space-y-3">
      {components?.map((event, i) => (
        <EventBlock key={i} event={event} />
      ))}
      {isStreaming && <LoadingDots />}
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
