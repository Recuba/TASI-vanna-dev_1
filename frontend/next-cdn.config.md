# CDN Configuration Guide

Instructions for deploying Ra'd AI frontend behind a CDN (CloudFlare or CloudFront).

## Environment Variable

Set `NEXT_PUBLIC_CDN_URL` to your CDN origin URL:

```env
NEXT_PUBLIC_CDN_URL=https://cdn.raid-ai.example.com
```

## Next.js Asset Prefix

To serve `_next/static/*` assets from a CDN, add `assetPrefix` to `next.config.mjs`:

```js
const nextConfig = {
  assetPrefix: process.env.NEXT_PUBLIC_CDN_URL || '',
  // ... existing config
};
```

## Cache-Control Headers by Asset Type

| Path Pattern | Cache-Control | Notes |
|---|---|---|
| `/_next/static/*` | `public, max-age=31536000, immutable` | Hashed filenames, safe to cache forever |
| `/*.html` | `public, max-age=0, must-revalidate` | Always fetch fresh HTML |
| `/api/*` | `public, max-age=60, stale-while-revalidate=300` | Short TTL for API responses |
| `/images/*`, `/icons/*` | `public, max-age=86400, stale-while-revalidate=3600` | 1-day cache for images |

## CloudFlare Setup

1. Add your domain to CloudFlare
2. Set up a CNAME record for `cdn.yourdomain.com` pointing to your origin
3. Create a Page Rule or Cache Rule:
   - Match: `cdn.yourdomain.com/_next/static/*`
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 month
4. Enable Auto Minify for JS/CSS
5. Enable Brotli compression

## CloudFront Setup

1. Create a CloudFront distribution with your origin domain
2. Create cache behaviors:

   **Behavior 1** - Static assets:
   - Path pattern: `/_next/static/*`
   - Cache policy: CachingOptimized (managed policy)
   - Compress: Yes (Gzip + Brotli)

   **Behavior 2** - Images:
   - Path pattern: `/images/*`
   - Cache policy: CachingOptimized
   - TTL override: min=0, default=86400, max=604800

   **Behavior 3** - Default:
   - Path pattern: `*`
   - Cache policy: CachingDisabled
   - Origin request policy: AllViewer

3. Set `NEXT_PUBLIC_CDN_URL` to the CloudFront distribution domain

## Verification

After setup, verify assets load from CDN:

```bash
curl -I https://cdn.yourdomain.com/_next/static/chunks/main-abc123.js
# Should show: x-cache: Hit from cloudfront (or cf-cache-status: HIT)
```
