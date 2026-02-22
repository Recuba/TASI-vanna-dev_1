/**
 * Financial calendar API types and functions.
 */

import { request, qs } from './client-base';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  date: string;
  type: 'dividend' | 'earnings';
  ticker: string;
  title: string;
  description: string | null;
}

export interface CalendarResponse {
  events: CalendarEvent[];
  count: number;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export function getCalendarEvents(
  params: { from: string; to: string; type?: string },
  signal?: AbortSignal,
): Promise<CalendarResponse> {
  return request<CalendarResponse>(
    `/api/v1/calendar/events${qs(params)}`,
    undefined,
    undefined,
    signal,
  );
}
