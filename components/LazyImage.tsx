/**
 * Lazy loading image component with placeholder and error handling
 */

import React, { useState, useEffect } from 'react';
import { Image, View, ActivityIndicator, StyleSheet, ImageProps, ImageStyle } from 'react-native';
import { ErrorHandler } from '@/lib/error-handler';

interface LazyImageProps extends Omit<ImageProps, 'source'> {
  uri: string;
  placeholder?: React.ReactNode;
  errorPlaceholder?: React.ReactNode;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: (error: Error) => void;
  style?: ImageStyle;
  loadingIndicatorColor?: string;
  fadeInDuration?: number;
}

/**
 * LazyImage component with loading states and error handling
 *
 * Features:
 * - Lazy loading with placeholder
 * - Loading indicator
 * - Error handling with fallback
 * - Fade-in animation
 * - Memory efficient
 *
 * Usage:
 * <LazyImage
 *   uri="https://example.com/image.jpg"
 *   style={{ width: 200, height: 200 }}
 *   placeholder={<CustomPlaceholder />}
 * />
 */
export function LazyImage({
  uri,
  placeholder,
  errorPlaceholder,
  onLoadStart,
  onLoadEnd,
  onError,
  style,
  loadingIndicatorColor = '#007bff',
  fadeInDuration = 300,
  ...imageProps
}: LazyImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    // Reset state when URI changes
    setLoading(true);
    setError(null);
    setOpacity(0);
  }, [uri]);

  const handleLoadStart = () => {
    setLoading(true);
    onLoadStart?.();
  };

  const handleLoadEnd = () => {
    setLoading(false);
    onLoadEnd?.();

    // Fade in animation
    setOpacity(1);
  };

  const handleError = (e: any) => {
    const error = new Error(`Failed to load image: ${uri}`);
    setError(error);
    setLoading(false);

    ErrorHandler.handleMediaError(uri, error);
    onError?.(error);
  };

  // Show error placeholder
  if (error) {
    if (errorPlaceholder) {
      return <>{errorPlaceholder}</>;
    }

    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <View style={styles.errorIconInner} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* Image */}
      <Image
        {...imageProps}
        source={{ uri }}
        style={[
          style,
          {
            opacity,
            position: loading ? 'absolute' : 'relative',
          },
        ]}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        fadeDuration={fadeInDuration}
      />

      {/* Loading state */}
      {loading && (
        <View style={[styles.loadingContainer, style]}>
          {placeholder || (
            <ActivityIndicator size="large" color={loadingIndicatorColor} />
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Preload images for better UX
 */
export async function preloadImages(uris: string[]): Promise<void> {
  const promises = uris.map(uri => {
    return new Promise<void>((resolve, reject) => {
      Image.prefetch(uri)
        .then(() => resolve())
        .catch(error => {
          ErrorHandler.handleMediaError(uri, error);
          resolve(); // Don't fail the whole batch
        });
    });
  });

  await Promise.all(promises);
}

/**
 * Get image size without loading the full image
 */
export function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      error => {
        ErrorHandler.handleMediaError(uri, error);
        reject(error);
      }
    );
  });
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  errorIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#dc3545',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconInner: {
    width: 4,
    height: 30,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
});
