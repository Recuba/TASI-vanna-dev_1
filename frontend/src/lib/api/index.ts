/**
 * Barrel re-export for the API client modules.
 *
 * New code should import from '@/lib/api' (or specific sub-modules).
 * The legacy '@/lib/api-client' path re-exports from here for backward compat.
 */

export { ApiError, request, qs, cachedRequest, authHeaders } from './client-base';
export * from './health';
export * from './news';
export * from './market';
export * from './stocks';
export * from './charts';
export * from './entities';
export * from './auth';
