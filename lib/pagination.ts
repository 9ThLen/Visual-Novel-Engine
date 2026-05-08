/**
 * Pagination utilities and hooks for efficient list rendering
 */

import { useState, useMemo, useCallback } from 'react';

export interface PaginationConfig {
  pageSize: number;
  initialPage?: number;
}

export interface PaginationResult<T> {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  items: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  goToPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
}

/**
 * Hook for paginating arrays
 *
 * Usage:
 * const pagination = usePagination(stories, { pageSize: 10 });
 *
 * return (
 *   <>
 *     {pagination.items.map(story => <StoryCard key={story.id} story={story} />)}
 *     <PaginationControls {...pagination} />
 *   </>
 * );
 */
export function usePagination<T>(
  items: T[],
  config: PaginationConfig
): PaginationResult<T> {
  const { pageSize, initialPage = 1 } = config;
  const [currentPage, setCurrentPage] = useState(initialPage);

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Ensure current page is valid
  const validCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));

  // Get items for current page
  const paginatedItems = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return items.slice(startIndex, endIndex);
  }, [items, validCurrentPage, pageSize]);

  const goToPage = useCallback((page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages || 1));
    setCurrentPage(validPage);
  }, [totalPages]);

  const nextPage = useCallback(() => {
    if (validCurrentPage < totalPages) {
      setCurrentPage(validCurrentPage + 1);
    }
  }, [validCurrentPage, totalPages]);

  const previousPage = useCallback(() => {
    if (validCurrentPage > 1) {
      setCurrentPage(validCurrentPage - 1);
    }
  }, [validCurrentPage]);

  const goToFirstPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  const goToLastPage = useCallback(() => {
    setCurrentPage(totalPages || 1);
  }, [totalPages]);

  return {
    currentPage: validCurrentPage,
    totalPages,
    pageSize,
    totalItems,
    items: paginatedItems,
    hasNextPage: validCurrentPage < totalPages,
    hasPreviousPage: validCurrentPage > 1,
    goToPage,
    nextPage,
    previousPage,
    goToFirstPage,
    goToLastPage,
  };
}

/**
 * Hook for infinite scroll pagination
 *
 * Usage:
 * const { items, loadMore, hasMore, loading } = useInfiniteScroll(allStories, { pageSize: 20 });
 */
export function useInfiniteScroll<T>(
  allItems: T[],
  config: PaginationConfig
): {
  items: T[];
  loadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  reset: () => void;
} {
  const { pageSize } = config;
  const [loadedPages, setLoadedPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.ceil(allItems.length / pageSize);
  const hasMore = loadedPages < totalPages;

  const items = useMemo(() => {
    return allItems.slice(0, loadedPages * pageSize);
  }, [allItems, loadedPages, pageSize]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      setLoading(true);
      // Simulate async loading
      setTimeout(() => {
        setLoadedPages(prev => prev + 1);
        setLoading(false);
      }, 100);
    }
  }, [hasMore, loading]);

  const reset = useCallback(() => {
    setLoadedPages(1);
    setLoading(false);
  }, []);

  return {
    items,
    loadMore,
    hasMore,
    loading,
    reset,
  };
}

/**
 * Search and filter with pagination
 */
export function useSearchablePagination<T>(
  items: T[],
  searchFn: (item: T, query: string) => boolean,
  config: PaginationConfig
): PaginationResult<T> & {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredCount: number;
} {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items.filter(item => searchFn(item, searchQuery));
  }, [items, searchQuery, searchFn]);

  const pagination = usePagination(filteredItems, config);

  return {
    ...pagination,
    searchQuery,
    setSearchQuery,
    filteredCount: filteredItems.length,
  };
}

/**
 * Paginate with sorting
 */
export function useSortablePagination<T>(
  items: T[],
  config: PaginationConfig
): PaginationResult<T> & {
  sortBy: keyof T | null;
  sortOrder: 'asc' | 'desc';
  setSorting: (key: keyof T, order: 'asc' | 'desc') => void;
} {
  const [sortBy, setSortBy] = useState<keyof T | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const sortedItems = useMemo(() => {
    if (!sortBy) return items;

    return [...items].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];

      if (aVal === bVal) return 0;

      const comparison = aVal < bVal ? -1 : 1;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [items, sortBy, sortOrder]);

  const pagination = usePagination(sortedItems, config);

  const setSorting = useCallback((key: keyof T, order: 'asc' | 'desc') => {
    setSortBy(key);
    setSortOrder(order);
  }, []);

  return {
    ...pagination,
    sortBy,
    sortOrder,
    setSorting,
  };
}
