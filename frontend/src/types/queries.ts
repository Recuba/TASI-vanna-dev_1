/**
 * Types for query history, saved queries, and export features.
 */

/** A single query execution record stored in IndexedDB */
export interface QueryRecord {
  id: string;
  naturalLanguageQuery: string;
  generatedSql: string;
  results: QueryResults | null;
  executedAt: number; // Unix timestamp in milliseconds
  executionTimeMs: number;
  rowCount: number;
  isFavorite: boolean;
  tags: string[];
  name?: string;
  notes?: string;
}

/** Tabular result set from a query */
export interface QueryResults {
  columns: string[];
  rows: (string | number | null)[][];
}

/** Sort field options for query history */
export type QuerySortField = 'executedAt' | 'executionTimeMs' | 'rowCount';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Filter options for query history listing */
export interface QueryHistoryFilters {
  searchText?: string;
  favoritesOnly?: boolean;
  sortField?: QuerySortField;
  sortDirection?: SortDirection;
}

/** A suggestion item for the query input */
export interface QuerySuggestion {
  text: string;
  source: 'recent' | 'popular';
  id?: string; // QueryRecord id for recent queries
}
