'use client';

import { useState, useCallback, useMemo } from 'react';

interface NewsFiltersState {
  page: number;
  activeSource: string | null;
  searchQuery: string;
  showSaved: boolean;
  activeSentiment: string | null;
  dateFrom: string;
  dateTo: string;
  showAdvancedFilters: boolean;
  advancedFilterCount: number;
}

interface NewsFiltersActions {
  setPage: (p: number | ((prev: number) => number)) => void;
  setSearchQuery: (q: string) => void;
  setShowSaved: (v: boolean) => void;
  setShowAdvancedFilters: (v: boolean | ((prev: boolean) => boolean)) => void;
  handleSourceChange: (source: string | null) => void;
  handleClearAdvancedFilters: () => void;
  handleSentimentChange: (sentiment: string) => void;
  handleDateFromChange: (value: string) => void;
  handleDateToChange: (value: string) => void;
}

export function useNewsFilters(
  resetAllArticles: () => void,
): NewsFiltersState & NewsFiltersActions {
  const [page, setPage] = useState(1);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [activeSentiment, setActiveSentiment] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const advancedFilterCount = useMemo(
    () => (activeSentiment ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0),
    [activeSentiment, dateFrom, dateTo],
  );

  const handleSourceChange = useCallback((source: string | null) => {
    setActiveSource(source);
    setPage(1);
    resetAllArticles();
    setShowSaved(false);
  }, [resetAllArticles]);

  const handleClearAdvancedFilters = useCallback(() => {
    setActiveSentiment(null);
    setDateFrom('');
    setDateTo('');
    setPage(1);
    resetAllArticles();
  }, [resetAllArticles]);

  const handleSentimentChange = useCallback((sentiment: string) => {
    setActiveSentiment((prev) => (prev === sentiment ? null : sentiment));
    setPage(1);
    resetAllArticles();
  }, [resetAllArticles]);

  const handleDateFromChange = useCallback((value: string) => {
    setDateFrom(value);
    setPage(1);
    resetAllArticles();
  }, [resetAllArticles]);

  const handleDateToChange = useCallback((value: string) => {
    setDateTo(value);
    setPage(1);
    resetAllArticles();
  }, [resetAllArticles]);

  return {
    page,
    activeSource,
    searchQuery,
    showSaved,
    activeSentiment,
    dateFrom,
    dateTo,
    showAdvancedFilters,
    advancedFilterCount,
    setPage,
    setSearchQuery,
    setShowSaved,
    setShowAdvancedFilters,
    handleSourceChange,
    handleClearAdvancedFilters,
    handleSentimentChange,
    handleDateFromChange,
    handleDateToChange,
  };
}
