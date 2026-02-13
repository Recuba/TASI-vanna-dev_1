import { openDB, type IDBPDatabase } from 'idb';
import type { QueryRecord, QueryHistoryFilters } from '@/types/queries';

const DB_NAME = 'raid-query-history';
const DB_VERSION = 1;
const STORE_NAME = 'queries';
const MAX_RECORDS = 500;

type QueryDB = IDBPDatabase<{
  queries: {
    key: string;
    value: QueryRecord;
    indexes: {
      'by-executedAt': number;
      'by-isFavorite': number;
    };
  };
}>;

let dbPromise: Promise<QueryDB> | null = null;

function getDB(): Promise<QueryDB> {
  if (!dbPromise) {
    dbPromise = openDB<{
      queries: {
        key: string;
        value: QueryRecord;
        indexes: {
          'by-executedAt': number;
          'by-isFavorite': number;
        };
      };
    }>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-executedAt', 'executedAt');
        store.createIndex('by-isFavorite', 'isFavorite');
      },
    });
  }
  return dbPromise;
}

function generateId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const queryStore = {
  /**
   * Add a new query record. Evicts oldest non-favorite records when over MAX_RECORDS.
   */
  async addQuery(
    record: Omit<QueryRecord, 'id' | 'isFavorite' | 'tags'>
  ): Promise<QueryRecord> {
    const db = await getDB();
    const fullRecord: QueryRecord = {
      ...record,
      id: generateId(),
      isFavorite: false,
      tags: [],
    };
    await db.put(STORE_NAME, fullRecord);

    // FIFO eviction: remove oldest non-favorites if over limit
    const count = await db.count(STORE_NAME);
    if (count > MAX_RECORDS) {
      const excess = count - MAX_RECORDS;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const index = tx.store.index('by-executedAt');
      let cursor = await index.openCursor();
      let deleted = 0;
      while (cursor && deleted < excess) {
        const rec = cursor.value;
        if (!rec.isFavorite) {
          await cursor.delete();
          deleted++;
        }
        cursor = await cursor.continue();
      }
      await tx.done;
    }

    return fullRecord;
  },

  /**
   * Get query history with optional filtering and sorting.
   */
  async getHistory(
    filters?: QueryHistoryFilters,
    limit = 50,
    offset = 0
  ): Promise<QueryRecord[]> {
    const db = await getDB();
    let records = await db.getAll(STORE_NAME);

    // Filter
    if (filters?.favoritesOnly) {
      records = records.filter((r) => r.isFavorite);
    }
    if (filters?.searchText) {
      const term = filters.searchText.toLowerCase();
      records = records.filter(
        (r) =>
          r.naturalLanguageQuery.toLowerCase().includes(term) ||
          r.generatedSql.toLowerCase().includes(term) ||
          (r.name && r.name.toLowerCase().includes(term)) ||
          r.tags.some((t) => t.toLowerCase().includes(term))
      );
    }

    // Sort
    const field = filters?.sortField ?? 'executedAt';
    const dir = filters?.sortDirection ?? 'desc';
    records.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      return dir === 'desc' ? bv - av : av - bv;
    });

    return records.slice(offset, offset + limit);
  },

  async getQueryById(id: string): Promise<QueryRecord | undefined> {
    const db = await getDB();
    return db.get(STORE_NAME, id);
  },

  async deleteQuery(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
  },

  async clearHistory(): Promise<void> {
    const db = await getDB();
    await db.clear(STORE_NAME);
  },

  async searchHistory(text: string): Promise<QueryRecord[]> {
    return this.getHistory({ searchText: text }, 20);
  },

  async getFavorites(): Promise<QueryRecord[]> {
    return this.getHistory({ favoritesOnly: true }, 100);
  },

  async toggleFavorite(id: string): Promise<QueryRecord | undefined> {
    const db = await getDB();
    const record = await db.get(STORE_NAME, id);
    if (!record) return undefined;
    record.isFavorite = !record.isFavorite;
    await db.put(STORE_NAME, record);
    return record;
  },

  async updateQuery(
    id: string,
    updates: Partial<Pick<QueryRecord, 'name' | 'tags' | 'notes' | 'isFavorite'>>
  ): Promise<QueryRecord | undefined> {
    const db = await getDB();
    const record = await db.get(STORE_NAME, id);
    if (!record) return undefined;
    Object.assign(record, updates);
    await db.put(STORE_NAME, record);
    return record;
  },

  async getCount(): Promise<number> {
    const db = await getDB();
    return db.count(STORE_NAME);
  },

  async getRecent(limit = 5): Promise<QueryRecord[]> {
    return this.getHistory(undefined, limit);
  },
};
