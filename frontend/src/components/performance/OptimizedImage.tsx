'use client';

import Image, { type ImageProps } from 'next/image';

/**
 * Wrapper around next/image with sensible performance defaults.
 *
 * - loading="lazy" by default (override via priority prop)
 * - quality=80 (good balance of size vs. quality)
 * - Responsive sizes with common breakpoints
 * - Optional blur placeholder
 */

interface OptimizedImageProps extends Omit<ImageProps, 'loading'> {
  /** Override default quality (80) */
  quality?: number;
  /** When true, image loads eagerly (above-the-fold images) */
  priority?: boolean;
}

const DEFAULT_SIZES = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

export function OptimizedImage({
  quality = 80,
  priority = false,
  sizes,
  alt,
  ...props
}: OptimizedImageProps) {
  return (
    <Image
      alt={alt}
      quality={quality}
      loading={priority ? 'eager' : 'lazy'}
      priority={priority}
      sizes={sizes ?? DEFAULT_SIZES}
      {...props}
    />
  );
}

export default OptimizedImage;
