import type { QueryRecord, QuerySuggestion } from '@/types/queries';

/** Popular TASI queries available as suggestions */
const popularQueriesAr: string[] = [
  'ما هي أعلى 10 شركات من حيث القيمة السوقية؟',
  'ما هي أعلى 10 أسهم من حيث عائد الأرباح الموزعة؟',
  'أظهر صافي الدخل لجميع البنوك السعودية',
  'قارن بين أرامكو والراجحي من حيث القيمة السوقية',
  'ما هو مكرر الأرباح لقطاع البنوك؟',
  'ما هي أعلى 10 شركات نمواً في الأرباح؟',
  'أظهر إيرادات أرامكو السنوية',
  'ما هي الشركات التي لديها أعلى عائد على حقوق الملكية؟',
];

const popularQueriesEn: string[] = [
  'What are the top 10 companies by market cap?',
  'What are the top 10 stocks by dividend yield?',
  'Show net income for all Saudi banks',
  'Compare Aramco vs Al Rajhi on market cap and P/E ratio',
  'What is the P/E ratio for the banking sector?',
  'What are the top 10 companies by earnings growth?',
  'Show Aramco annual revenue trend',
  'Which companies have the highest ROE?',
  'Plot market cap by sector as a bar chart',
  'Show me the top gainers today',
  'What are SABIC financial metrics?',
  'Compare banking sector vs petrochemical sector profitability',
];

/**
 * Simple fuzzy matching: checks if all words in the input appear (in order or not)
 * somewhere in the target string.
 */
function fuzzyMatch(input: string, target: string): number {
  const inputLower = input.toLowerCase();
  const targetLower = target.toLowerCase();

  // Exact substring match gets highest score
  if (targetLower.includes(inputLower)) {
    return 1.0;
  }

  // Word-level matching
  const inputWords = inputLower.split(/\s+/).filter(Boolean);
  if (inputWords.length === 0) return 0;

  let matchedWords = 0;
  for (const word of inputWords) {
    if (targetLower.includes(word)) {
      matchedWords++;
    }
  }

  return matchedWords / inputWords.length;
}

/**
 * Get query suggestions based on input text and recent query history.
 * Returns max 8 suggestions, prioritizing recent queries over popular ones.
 */
export function getSuggestions(
  input: string,
  recentQueries: QueryRecord[],
  language: 'ar' | 'en' = 'en',
  maxResults = 8
): QuerySuggestion[] {
  const trimmed = input.trim();
  const suggestions: QuerySuggestion[] = [];

  // If no input, show most recent queries
  if (!trimmed) {
    const recent = recentQueries.slice(0, 5).map((q): QuerySuggestion => ({
      text: q.naturalLanguageQuery,
      source: 'recent',
      id: q.id,
    }));
    return recent;
  }

  // Score and rank recent queries
  const recentScored: { suggestion: QuerySuggestion; score: number }[] = [];
  for (const q of recentQueries) {
    const score = fuzzyMatch(trimmed, q.naturalLanguageQuery);
    if (score > 0.3) {
      recentScored.push({
        suggestion: { text: q.naturalLanguageQuery, source: 'recent', id: q.id },
        score,
      });
    }
  }

  // Score and rank popular queries
  const popularQueries = language === 'ar' ? popularQueriesAr : popularQueriesEn;
  const popularScored: { suggestion: QuerySuggestion; score: number }[] = [];
  for (const text of popularQueries) {
    const score = fuzzyMatch(trimmed, text);
    if (score > 0.3) {
      popularScored.push({
        suggestion: { text, source: 'popular' },
        score,
      });
    }
  }

  // Sort each group by score descending
  recentScored.sort((a, b) => b.score - a.score);
  popularScored.sort((a, b) => b.score - a.score);

  // Interleave: recent queries first (up to 5), then popular (up to 3)
  const seen = new Set<string>();
  for (const item of recentScored) {
    if (suggestions.length >= maxResults) break;
    const key = item.suggestion.text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      suggestions.push(item.suggestion);
    }
  }
  for (const item of popularScored) {
    if (suggestions.length >= maxResults) break;
    const key = item.suggestion.text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      suggestions.push(item.suggestion);
    }
  }

  return suggestions;
}
