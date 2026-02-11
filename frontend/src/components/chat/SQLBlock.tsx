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
    <div className="rounded-lg overflow-hidden border gold-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-input)] border-b gold-border">
        <span className="text-xs font-medium text-gold tracking-wider">
          استعلام SQL
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-all duration-200',
            copied
              ? 'text-accent-green'
              : 'text-[var(--text-muted)] hover:text-gold hover:bg-gold/10'
          )}
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              تم النسخ
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              نسخ
            </>
          )}
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
