/**
 * Health check API types and functions.
 */

import { request } from './client-base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthComponentResponse {
  name: string;
  status: string;
  latency_ms: number | null;
  message: string;
}

export interface HealthResponse {
  status: string;
  components: HealthComponentResponse[];
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request('/health', undefined, undefined, signal);
}
