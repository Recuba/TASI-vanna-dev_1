import type { Config } from 'tailwindcss';
import { tailwindTokens } from './src/styles/design-system';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...tailwindTokens.colors,
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
      borderRadius: tailwindTokens.borderRadius,
      borderColor: {
        ...tailwindTokens.borderColor,
      },
      boxShadow: {
        'gold-sm': '0 1px 3px rgba(212, 168, 75, 0.12)',
        'gold-md': '0 4px 12px rgba(212, 168, 75, 0.15)',
        'gold-lg': '0 8px 24px rgba(212, 168, 75, 0.2)',
        elevated: '0 4px 16px rgba(0, 0, 0, 0.4)',
      },
      fontFamily: {
        arabic: [...tailwindTokens.fontFamily.arabic],
        english: [...tailwindTokens.fontFamily.english],
        mono: [...tailwindTokens.fontFamily.mono],
      },
      maxWidth: {
        content: '960px',
        'content-lg': '1040px',
      },
      height: {
        header: '64px',
        'header-mobile': '56px',
      },
      width: {
        sidebar: '260px',
        'sidebar-collapsed': '64px',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #D4A84B 0%, #E8C872 50%, #B8860B 100%)',
        'page-dark': 'radial-gradient(ellipse at top, #1a1a1a 0%, #0E0E0E 50%)',
        'page-light': 'radial-gradient(ellipse at top, #FFFFFF 0%, #FAFAFA 50%)',
      },
      keyframes: {
        'gold-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'dot-bounce': {
          '0%, 80%, 100%': { transform: 'scale(0)' },
          '40%': { transform: 'scale(1)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'tab-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'chart-section-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'chart-fullscreen-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'gold-pulse': 'gold-pulse 2s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.6s ease-out',
        'fade-in-up-delay-1': 'fade-in-up 0.6s ease-out 0.1s both',
        'fade-in-up-delay-2': 'fade-in-up 0.6s ease-out 0.2s both',
        'fade-in-up-delay-3': 'fade-in-up 0.6s ease-out 0.3s both',
        shimmer: 'shimmer 2s infinite',
        'dot-bounce': 'dot-bounce 1.4s ease-in-out infinite both',
        'slide-down': 'slide-down 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'tab-in': 'tab-in 0.25s ease-out',
        'chart-section-in': 'chart-section-in 0.35s ease-out',
        'chart-fullscreen-in': 'chart-fullscreen-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
