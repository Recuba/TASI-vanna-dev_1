/**
 * Legacy compatibility shim.
 *
 * All types and functions have moved to '@/lib/api/' domain modules.
 * Import from '@/lib/api' for new code. This file re-exports everything
 * so existing imports from '@/lib/api-client' continue to work.
 */

export * from './api';
