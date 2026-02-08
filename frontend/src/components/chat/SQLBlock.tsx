'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { SSECodeData } from '@/lib/types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface SQLBlockProps {
  data: SSECodeData;
}

export function SQLBlock({ data }: SQLBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-md overflow-hidden border gold-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-input)] border-b gold-border">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          {data.language || 'sql'}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            'text-xs px-2 py-0.5 rounded transition-colors',
            copied
              ? 'text-accent-green'
              : 'text-[var(--text-muted)] hover:text-gold'
          )}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* Code */}
      <SyntaxHighlighter
        language={data.language || 'sql'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px',
          fontSize: '13px',
          background: 'var(--bg-card)',
          borderRadius: 0,
        }}
        wrapLongLines
      >
        {data.content}
      </SyntaxHighlighter>
    </div>
  );
}
