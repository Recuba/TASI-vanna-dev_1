/**
 * Image optimization configuration for next.config.mjs `images` section.
 *
 * Usage in next.config.mjs:
 *   import { imageConfig } from './src/lib/performance/image-config';
 *   const nextConfig = { images: imageConfig, ... };
 */

export const imageConfig = {
  /** Allowed remote image domains */
  remotePatterns: [
    {
      protocol: 'https' as const,
      hostname: 's3-symbol-logo.tradingview.com',
      pathname: '/**',
    },
    {
      protocol: 'https' as const,
      hostname: 'www.tadawul.com.sa',
      pathname: '/**',
    },
  ],

  /** Breakpoints for srcset generation */
  deviceSizes: [640, 750, 828, 1080, 1200, 1920],

  /** Fixed image widths for srcset */
  imageSizes: [16, 32, 48, 64, 96, 128, 256],

  /** Preferred output formats (Next.js serves best supported) */
  formats: ['image/avif' as const, 'image/webp' as const],

  /** Minimum cache TTL in seconds (1 hour) */
  minimumCacheTTL: 3600,
};
