/**
 * Pagination controls component
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { PaginationResult } from '@/lib/pagination';

interface PaginationControlsProps<T> {
  pagination: PaginationResult<T>;
  colors?: {
    primary: string;
    background: string;
    text: string;
    disabled: string;
  };
  showPageNumbers?: boolean;
  maxPageButtons?: number;
}

/**
 * Pagination controls component
 *
 * Usage:
 * const pagination = usePagination(stories, { pageSize: 10 });
 * <PaginationControls pagination={pagination} />
 */
export function PaginationControls<T>({
  pagination,
  colors = {
    primary: '#007bff',
    background: '#f8f9fa',
    text: '#212529',
    disabled: '#6c757d',
  },
  showPageNumbers = true,
  maxPageButtons = 5,
}: PaginationControlsProps<T>) {
  const {
    currentPage,
    totalPages,
    totalItems,
    hasNextPage,
    hasPreviousPage,
    goToPage,
    nextPage,
    previousPage,
    goToFirstPage,
    goToLastPage,
  } = pagination;

  if (totalPages <= 1) {
    return null; // Don't show pagination if only one page
  }

  // Calculate which page numbers to show
  const getPageNumbers = (): number[] => {
    if (totalPages <= maxPageButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(maxPageButtons / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxPageButtons - 1);

    if (end - start < maxPageButtons - 1) {
      start = Math.max(1, end - maxPageButtons + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const pageNumbers = showPageNumbers ? getPageNumbers() : [];

  return (
    <View style={styles.container}>
      {/* Info */}
      <Text style={[styles.info, { color: colors.text }]}>
        Сторінка {currentPage} з {totalPages} • Всього: {totalItems}
      </Text>

      {/* Controls */}
      <View style={styles.controls}>
        {/* First page */}
        <Pressable
          onPress={goToFirstPage}
          disabled={!hasPreviousPage}
          style={[
            styles.button,
            { backgroundColor: colors.background },
            !hasPreviousPage && styles.buttonDisabled,
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              { color: hasPreviousPage ? colors.primary : colors.disabled },
            ]}
          >
            ««
          </Text>
        </Pressable>

        {/* Previous page */}
        <Pressable
          onPress={previousPage}
          disabled={!hasPreviousPage}
          style={[
            styles.button,
            { backgroundColor: colors.background },
            !hasPreviousPage && styles.buttonDisabled,
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              { color: hasPreviousPage ? colors.primary : colors.disabled },
            ]}
          >
            «
          </Text>
        </Pressable>

        {/* Page numbers */}
        {showPageNumbers && pageNumbers.map(pageNum => (
          <Pressable
            key={pageNum}
            onPress={() => goToPage(pageNum)}
            style={[
              styles.button,
              pageNum === currentPage
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.background },
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                {
                  color: pageNum === currentPage ? '#fff' : colors.text,
                  fontWeight: pageNum === currentPage ? '700' : '400',
                },
              ]}
            >
              {pageNum}
            </Text>
          </Pressable>
        ))}

        {/* Next page */}
        <Pressable
          onPress={nextPage}
          disabled={!hasNextPage}
          style={[
            styles.button,
            { backgroundColor: colors.background },
            !hasNextPage && styles.buttonDisabled,
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              { color: hasNextPage ? colors.primary : colors.disabled },
            ]}
          >
            »
          </Text>
        </Pressable>

        {/* Last page */}
        <Pressable
          onPress={goToLastPage}
          disabled={!hasNextPage}
          style={[
            styles.button,
            { backgroundColor: colors.background },
            !hasNextPage && styles.buttonDisabled,
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              { color: hasNextPage ? colors.primary : colors.disabled },
            ]}
          >
            »»
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  info: {
    fontSize: 14,
    marginBottom: 12,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  button: {
    minWidth: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
  },
});
