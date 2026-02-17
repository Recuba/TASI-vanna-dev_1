'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Variant styles
// ---------------------------------------------------------------------------

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gold text-dark-bg hover:bg-gold-light active:scale-[0.97] font-medium rounded-xl transition-all',
  secondary:
    'border border-gold/30 text-gold hover:bg-gold/10 active:scale-[0.97] font-medium rounded-xl transition-all',
  destructive:
    'bg-accent-red/10 text-accent-red border border-accent-red/20 hover:bg-accent-red/20 active:scale-[0.97] font-medium rounded-lg transition-all',
  ghost:
    'text-text-secondary hover:text-gold hover:bg-gold/5 active:scale-[0.97] rounded-lg transition-all',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-1.5 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-3.5 text-base',
};

// Default sizes for variants that specify their own padding
const variantDefaultSize: Record<ButtonVariant, string> = {
  primary: 'px-6 py-3',
  secondary: 'px-6 py-3',
  destructive: 'px-4 py-2',
  ghost: 'px-4 py-2',
};

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size, loading = false, disabled, className, children, ...rest },
  ref,
) {
  const sizeStyle = size ? sizeClasses[size] : variantDefaultSize[variant];

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2',
        variantClasses[variant],
        sizeStyle,
        (disabled || loading) && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});
