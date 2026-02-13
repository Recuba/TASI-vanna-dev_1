import { describe, it, expect } from 'vitest';
import { getSuggestions } from '../suggestions';
import type { QueryRecord } from '@/types/queries';

function makeRecord(query: string, executedAt?: number): QueryRecord {
  return {
    id: `q-${Math.random().toString(36).slice(2)}`,
    naturalLanguageQuery: query,
    generatedSql: 'SELECT 1',
    results: null,
    executedAt: executedAt || Date.now(),
    executionTimeMs: 100,
    rowCount: 0,
    isFavorite: false,
    tags: [],
  };
}

describe('getSuggestions', () => {
  it('should return recent queries when input is empty', () => {
    const recent = [
      makeRecord('Top 10 by market cap'),
      makeRecord('Banking sector P/E'),
      makeRecord('Aramco revenue'),
    ];

    const results = getSuggestions('', recent, 'en');
    expect(results.length).toBe(3);
    expect(results[0].source).toBe('recent');
    expect(results[0].text).toBe('Top 10 by market cap');
  });

  it('should return max 5 recent queries when input is empty', () => {
    const recent = Array.from({ length: 10 }, (_, i) =>
      makeRecord(`Query ${i}`)
    );

    const results = getSuggestions('', recent, 'en');
    expect(results.length).toBe(5);
  });

  it('should match recent queries by substring', () => {
    const recent = [
      makeRecord('Top 10 companies by market cap'),
      makeRecord('Banking sector analysis'),
      makeRecord('Aramco annual revenue'),
    ];

    const results = getSuggestions('market', recent, 'en');
    expect(results.some((s) => s.text.includes('market'))).toBe(true);
    // Banking query should not match "market"
    expect(results.some((s) => s.text === 'Banking sector analysis')).toBe(false);
  });

  it('should match popular queries', () => {
    const results = getSuggestions('dividend', [], 'en');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((s) => s.source === 'popular')).toBe(true);
    expect(results.some((s) => s.text.toLowerCase().includes('dividend'))).toBe(true);
  });

  it('should deduplicate suggestions', () => {
    const recent = [
      makeRecord('What are the top 10 companies by market cap?'),
    ];

    // This text appears in both recent and popular lists
    const results = getSuggestions('top 10 companies', recent, 'en');
    const texts = results.map((s) => s.text.toLowerCase());
    const uniqueTexts = new Set(texts);
    expect(texts.length).toBe(uniqueTexts.size);
  });

  it('should prioritize recent queries over popular', () => {
    const recent = [
      makeRecord('Custom banking query about market cap'),
    ];

    const results = getSuggestions('market cap', recent, 'en');
    if (results.length >= 2) {
      // First result should be from recent if it matches
      const recentResults = results.filter((s) => s.source === 'recent');
      const popularResults = results.filter((s) => s.source === 'popular');
      if (recentResults.length > 0 && popularResults.length > 0) {
        const firstRecentIndex = results.indexOf(recentResults[0]);
        const firstPopularIndex = results.indexOf(popularResults[0]);
        expect(firstRecentIndex).toBeLessThan(firstPopularIndex);
      }
    }
  });

  it('should return at most maxResults suggestions', () => {
    const recent = Array.from({ length: 20 }, (_, i) =>
      makeRecord(`Query about banks ${i}`)
    );

    const results = getSuggestions('banks', recent, 'en', 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('should handle Arabic queries', () => {
    const recent = [
      makeRecord('ما هي أعلى 10 شركات من حيث القيمة السوقية؟'),
    ];

    const results = getSuggestions('شركات', recent, 'ar');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((s) => s.text.includes('شركات'))).toBe(true);
  });

  it('should return empty array for non-matching input', () => {
    const results = getSuggestions('xyznonexistentquery123', [], 'en');
    expect(results.length).toBe(0);
  });

  it('should do word-level matching', () => {
    const recent = [
      makeRecord('Show me all Saudi banks sorted by profit margin'),
    ];

    const results = getSuggestions('Saudi profit', recent, 'en');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should include query record id for recent suggestions', () => {
    const recent = [makeRecord('Test query')];
    const results = getSuggestions('', recent, 'en');
    expect(results[0].id).toBeTruthy();
    expect(results[0].source).toBe('recent');
  });
});
