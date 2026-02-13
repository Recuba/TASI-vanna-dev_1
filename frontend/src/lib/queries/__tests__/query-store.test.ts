import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the idb module since IndexedDB is not available in jsdom
const mockRecords = new Map<string, Record<string, unknown>>();

vi.mock('idb', () => ({
  openDB: vi.fn(() =>
    Promise.resolve({
      put: vi.fn((_store: string, record: { id: string }) => {
        mockRecords.set(record.id, record as Record<string, unknown>);
        return Promise.resolve();
      }),
      get: vi.fn((_store: string, id: string) => {
        return Promise.resolve(mockRecords.get(id));
      }),
      getAll: vi.fn(() => {
        return Promise.resolve(Array.from(mockRecords.values()));
      }),
      delete: vi.fn((_store: string, id: string) => {
        mockRecords.delete(id);
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        mockRecords.clear();
        return Promise.resolve();
      }),
      count: vi.fn(() => Promise.resolve(mockRecords.size)),
      transaction: vi.fn(() => ({
        store: {
          index: vi.fn(() => ({
            openCursor: vi.fn(() => Promise.resolve(null)),
          })),
        },
        done: Promise.resolve(),
      })),
    })
  ),
}));

// Import after mock
import { queryStore } from '../query-store';

describe('queryStore', () => {
  beforeEach(() => {
    mockRecords.clear();
  });

  it('should add a query and return a record with id', async () => {
    const record = await queryStore.addQuery({
      naturalLanguageQuery: 'What are the top 10 companies?',
      generatedSql: 'SELECT * FROM companies LIMIT 10',
      results: { columns: ['ticker', 'name'], rows: [['2222.SR', 'Aramco']] },
      executedAt: Date.now(),
      executionTimeMs: 150,
      rowCount: 1,
    });

    expect(record.id).toBeTruthy();
    expect(record.id).toMatch(/^q-/);
    expect(record.isFavorite).toBe(false);
    expect(record.tags).toEqual([]);
    expect(record.naturalLanguageQuery).toBe('What are the top 10 companies?');
  });

  it('should retrieve a query by id', async () => {
    const added = await queryStore.addQuery({
      naturalLanguageQuery: 'Test query',
      generatedSql: 'SELECT 1',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 50,
      rowCount: 0,
    });

    const found = await queryStore.getQueryById(added.id);
    expect(found).toBeDefined();
    expect(found?.naturalLanguageQuery).toBe('Test query');
  });

  it('should return undefined for non-existent id', async () => {
    const found = await queryStore.getQueryById('non-existent-id');
    expect(found).toBeUndefined();
  });

  it('should delete a query', async () => {
    const added = await queryStore.addQuery({
      naturalLanguageQuery: 'Delete me',
      generatedSql: 'SELECT 1',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 10,
      rowCount: 0,
    });

    await queryStore.deleteQuery(added.id);
    const found = await queryStore.getQueryById(added.id);
    expect(found).toBeUndefined();
  });

  it('should clear all history', async () => {
    await queryStore.addQuery({
      naturalLanguageQuery: 'Query 1',
      generatedSql: 'SELECT 1',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 10,
      rowCount: 0,
    });
    await queryStore.addQuery({
      naturalLanguageQuery: 'Query 2',
      generatedSql: 'SELECT 2',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 20,
      rowCount: 0,
    });

    await queryStore.clearHistory();
    const count = await queryStore.getCount();
    expect(count).toBe(0);
  });

  it('should toggle favorite status', async () => {
    const added = await queryStore.addQuery({
      naturalLanguageQuery: 'Favorite me',
      generatedSql: 'SELECT 1',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 10,
      rowCount: 0,
    });

    expect(added.isFavorite).toBe(false);

    const toggled = await queryStore.toggleFavorite(added.id);
    expect(toggled?.isFavorite).toBe(true);

    const toggledBack = await queryStore.toggleFavorite(added.id);
    expect(toggledBack?.isFavorite).toBe(false);
  });

  it('should update query name, tags, and notes', async () => {
    const added = await queryStore.addQuery({
      naturalLanguageQuery: 'Update me',
      generatedSql: 'SELECT 1',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 10,
      rowCount: 0,
    });

    const updated = await queryStore.updateQuery(added.id, {
      name: 'My saved query',
      tags: ['banking', 'analysis'],
      notes: 'Useful for weekly reports',
    });

    expect(updated?.name).toBe('My saved query');
    expect(updated?.tags).toEqual(['banking', 'analysis']);
    expect(updated?.notes).toBe('Useful for weekly reports');
  });

  it('should return undefined when updating non-existent query', async () => {
    const result = await queryStore.updateQuery('non-existent', { name: 'test' });
    expect(result).toBeUndefined();
  });

  it('should filter history by search text', async () => {
    await queryStore.addQuery({
      naturalLanguageQuery: 'Show banking sector data',
      generatedSql: 'SELECT * FROM companies WHERE sector = "Banks"',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 100,
      rowCount: 10,
    });
    await queryStore.addQuery({
      naturalLanguageQuery: 'Top companies by market cap',
      generatedSql: 'SELECT * FROM market_data ORDER BY market_cap DESC',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 200,
      rowCount: 500,
    });

    const results = await queryStore.getHistory({ searchText: 'banking' });
    expect(results.length).toBe(1);
    expect(results[0].naturalLanguageQuery).toContain('banking');
  });

  it('should filter history by favorites only', async () => {
    const q1 = await queryStore.addQuery({
      naturalLanguageQuery: 'Query 1',
      generatedSql: 'SELECT 1',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 10,
      rowCount: 0,
    });
    await queryStore.addQuery({
      naturalLanguageQuery: 'Query 2',
      generatedSql: 'SELECT 2',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 20,
      rowCount: 0,
    });

    await queryStore.toggleFavorite(q1.id);

    const results = await queryStore.getHistory({ favoritesOnly: true });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(q1.id);
  });

  it('should sort history by different fields', async () => {
    await queryStore.addQuery({
      naturalLanguageQuery: 'Slow query',
      generatedSql: 'SELECT 1',
      results: null,
      executedAt: Date.now() - 1000,
      executionTimeMs: 500,
      rowCount: 10,
    });
    await queryStore.addQuery({
      naturalLanguageQuery: 'Fast query',
      generatedSql: 'SELECT 2',
      results: null,
      executedAt: Date.now(),
      executionTimeMs: 50,
      rowCount: 100,
    });

    // Sort by execution time ascending
    const byTime = await queryStore.getHistory({
      sortField: 'executionTimeMs',
      sortDirection: 'asc',
    });
    expect(byTime[0].naturalLanguageQuery).toBe('Fast query');

    // Sort by row count descending
    const byRows = await queryStore.getHistory({
      sortField: 'rowCount',
      sortDirection: 'desc',
    });
    expect(byRows[0].rowCount).toBe(100);
  });

  it('should return recent queries', async () => {
    for (let i = 0; i < 10; i++) {
      await queryStore.addQuery({
        naturalLanguageQuery: `Query ${i}`,
        generatedSql: `SELECT ${i}`,
        results: null,
        executedAt: Date.now() + i,
        executionTimeMs: 10,
        rowCount: 0,
      });
    }

    const recent = await queryStore.getRecent(5);
    expect(recent.length).toBe(5);
  });
});
