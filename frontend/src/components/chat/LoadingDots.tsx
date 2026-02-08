export function LoadingDots() {
  return (
    <div className="inline-flex gap-1 items-center py-2">
      <span
        className="w-2 h-2 bg-gold rounded-full animate-dot-bounce"
        style={{ animationDelay: '-0.32s' }}
      />
      <span
        className="w-2 h-2 bg-gold rounded-full animate-dot-bounce"
        style={{ animationDelay: '-0.16s' }}
      />
      <span className="w-2 h-2 bg-gold rounded-full animate-dot-bounce" />
    </div>
  );
}
