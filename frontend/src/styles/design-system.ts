/**
 * Ra'd AI Design System Tokens
 * Extracted from the existing templates/index.html Ra'd AI theme.
 * Single source of truth for colors, spacing, typography, and layout constants.
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const colors = {
  gold: {
    primary: '#D4A84B',
    light: '#E8C872',
    dark: '#B8860B',
    glow: 'rgba(212, 168, 75, 0.3)',
    border: 'rgba(212, 168, 75, 0.2)',
    borderHover: 'rgba(212, 168, 75, 0.6)',
  },
  bg: {
    dark: '#0E0E0E',
    card: '#1A1A1A',
    cardHover: '#252525',
    input: '#2A2A2A',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#B0B0B0',
    muted: '#707070',
  },
  accent: {
    green: '#4CAF50',
    red: '#FF6B6B',
    blue: '#4A9FFF',
    warning: '#FFA726',
  },
  // Light mode overrides
  light: {
    bg: {
      dark: '#FAFAFA',
      card: '#FFFFFF',
      cardHover: '#F5F5F5',
      input: '#F0F0F0',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#555555',
      muted: '#999999',
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
} as const;

// ---------------------------------------------------------------------------
// Border Radii
// ---------------------------------------------------------------------------

export const radii = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  pill: '9999px',
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const typography = {
  fontFamily: {
    arabic: "'IBM Plex Sans Arabic', 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    english: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'IBM Plex Mono', 'Fira Code', 'Consolas', monospace",
  },
  fontSize: {
    xs: '12px',
    sm: '13px',
    base: '14px',
    md: '16px',
    lg: '18px',
    xl: '22px',
    '2xl': '28px',
    '3xl': '32px',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    bold: 700,
  },
  lineHeight: {
    tight: 1.3,
    normal: 1.6,
  },
} as const;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const layout = {
  contentMaxWidth: '960px',
  contentMaxWidthLg: '1040px',
  headerHeight: '64px',
  headerHeightMobile: '56px',
  sidebarWidth: '260px',
  sidebarWidthCollapsed: '64px',
} as const;

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export const transitions = {
  base: '0.3s ease',
  fast: '0.15s ease',
  slow: '0.5s ease',
} as const;

// ---------------------------------------------------------------------------
// Gradients
// ---------------------------------------------------------------------------

export const gradients = {
  gold: 'linear-gradient(135deg, #D4A84B 0%, #E8C872 50%, #B8860B 100%)',
  bgPage: 'radial-gradient(ellipse at top, #1a1a1a 0%, #0E0E0E 50%)',
  bgPageLight: 'radial-gradient(ellipse at top, #FFFFFF 0%, #FAFAFA 50%)',
} as const;

// ---------------------------------------------------------------------------
// Breakpoints (matches Tailwind defaults)
// ---------------------------------------------------------------------------

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1200px',
  '2xl': '1536px',
} as const;

// ---------------------------------------------------------------------------
// Tailwind-compatible token export for tailwind.config.ts
// ---------------------------------------------------------------------------

export const tailwindTokens = {
  colors: {
    gold: {
      DEFAULT: colors.gold.primary,
      light: colors.gold.light,
      dark: colors.gold.dark,
    },
    dark: {
      bg: colors.bg.dark,
      card: colors.bg.card,
      'card-hover': colors.bg.cardHover,
      input: colors.bg.input,
    },
    'text-primary': colors.text.primary,
    'text-secondary': colors.text.secondary,
    'text-muted': colors.text.muted,
    accent: {
      green: colors.accent.green,
      red: colors.accent.red,
      blue: colors.accent.blue,
      warning: colors.accent.warning,
    },
  },
  borderRadius: {
    sm: radii.sm,
    md: radii.md,
    lg: radii.lg,
    pill: radii.pill,
  },
  fontFamily: {
    arabic: ['IBM Plex Sans Arabic', 'Tajawal', 'sans-serif'],
    english: ['Inter', 'sans-serif'],
    mono: ['IBM Plex Mono', 'Fira Code', 'Consolas', 'monospace'],
  },
} as const;
