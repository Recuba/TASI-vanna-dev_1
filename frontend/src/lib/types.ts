/**
 * Types for the Vanna 2.0 SSE chat interface.
 */

/** SSE event types sent by the Vanna backend */
export type SSEEventType = 'progress' | 'code' | 'table' | 'chart' | 'text';

/** A single SSE event from the backend */
export interface SSEEvent {
  type: SSEEventType;
  data: SSEProgressData | SSECodeData | SSETableData | SSEChartData | SSETextData;
}

export interface SSEProgressData {
  message: string;
}

export interface SSECodeData {
  language: string;
  content: string;
}

export interface SSETableData {
  columns: string[];
  rows: (string | number | null)[][];
}

export interface SSEChartData {
  plotly_json: Record<string, unknown>;
}

export interface SSETextData {
  content: string;
}

/** A chat message in the conversation */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Streamed components from the assistant */
  components?: SSEEvent[];
  /** Whether the assistant is still streaming */
  isStreaming?: boolean;
}
