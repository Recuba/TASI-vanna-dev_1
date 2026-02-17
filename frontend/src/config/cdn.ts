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

