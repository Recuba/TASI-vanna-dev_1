interface LoadingDotsProps {
  /** Optional live progress message from the backend */
  progressText?: string;
}

export function LoadingDots({ progressText }: LoadingDotsProps) {
  return (
    <div className="inline-flex gap-1.5 items-center py-2">
      <span
        className="w-2 h-2 bg-gold rounded-full animate-dot-bounce"
        style={{ animationDelay: '-0.32s' }}
      />
      <span
        className="w-2 h-2 bg-gold rounded-full animate-dot-bounce"
        style={{ animationDelay: '-0.16s' }}
      />
      <span className="w-2 h-2 bg-gold rounded-full animate-dot-bounce" />
      {progressText && (
        <span className="text-xs text-[var(--text-muted)] italic ms-1 animate-fade-in">
          {progressText}
        </span>
      )}
    </div>
  );
}
