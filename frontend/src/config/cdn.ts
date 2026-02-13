/**
 * CDN configuration for static asset delivery.
 *
 * When deploying behind a CDN (CloudFlare, CloudFront, etc.), set the
 * NEXT_PUBLIC_CDN_URL environment variable to the CDN origin URL.
 * This module provides helpers for building CDN-prefixed asset URLs.
 */

/** CDN base URL (empty string = same origin, no CDN) */
export const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL ?? '';

/**
 * Returns a CDN-prefixed URL for a static asset path.
 *
 * @param path - Asset path starting with "/" (e.g., "/images/logo.webp")
 * @returns Full URL with CDN prefix, or the original path if no CDN configured
 */
export function cdnAssetUrl(path: string): string {
  if (!CDN_URL) return path;
  return `${CDN_URL}${path}`;
}

/**
 * Recommended Cache-Control headers by asset type.
 * For reference when configuring CDN cache rules.
 */
export const CACHE_POLICIES = {
  /** Immutable hashed assets (_next/static) - cache forever */
  immutable: 'public, max-age=31536000, immutable',
  /** HTML pages - revalidate every request */
  html: 'public, max-age=0, must-revalidate',
  /** API responses - short cache with stale-while-revalidate */
  api: 'public, max-age=60, stale-while-revalidate=300',
  /** Images - cache for 1 day */
  images: 'public, max-age=86400, stale-while-revalidate=3600',
} as const;
