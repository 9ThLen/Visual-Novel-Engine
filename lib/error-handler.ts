/**
 * Error handling utilities for the Visual Novel Engine
 */

export enum ErrorSeverity {
  LOW = 'low',       // Minor issues, app continues normally
  MEDIUM = 'medium', // Significant issues, some features may not work
  HIGH = 'high',     // Critical issues, app functionality severely impacted
  CRITICAL = 'critical' // Fatal errors, app cannot continue
}

export enum ErrorCategory {
  STORAGE = 'storage',           // AsyncStorage errors
  NETWORK = 'network',           // Network/API errors
  VALIDATION = 'validation',     // Data validation errors
  RENDERING = 'rendering',       // React rendering errors
  MEDIA = 'media',              // Image/audio loading errors
  UNKNOWN = 'unknown'           // Uncategorized errors
}

export interface AppError {
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  originalError?: Error;
  timestamp: number;
  context?: Record<string, any>;
}

export class ErrorHandler {
  private static errorListeners: Array<(error: AppError) => void> = [];
  private static userAlertCallback?: (message: string, severity: ErrorSeverity) => void;

  /**
   * Set a callback for showing errors to the user (e.g., React Native Alert)
   */
  static setUserAlertCallback(callback: (message: string, severity: ErrorSeverity) => void): void {
    this.userAlertCallback = callback;
  }

  /**
   * Clear all error listeners (useful for testing and preventing memory leaks)
   */
  static clearListeners(): void {
    this.errorListeners = [];
  }

  /**
   * Register a listener for errors
   */
  static addListener(listener: (error: AppError) => void): () => void {
    this.errorListeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.errorListeners = this.errorListeners.filter(l => l !== listener);
    };
  }

  /**
   * Handle an error with proper categorization and severity
   */
  static handle(
    message: string,
    originalError: Error | unknown,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: Record<string, any>
  ): AppError {
    // Convert unknown errors to proper Error objects for better debugging
    let normalizedError: Error | undefined;
    if (originalError instanceof Error) {
      normalizedError = originalError;
    } else if (typeof originalError === 'string') {
      normalizedError = new Error(originalError);
    } else if (originalError !== null && originalError !== undefined) {
      // Handle objects, numbers, etc. that might come from native modules
      normalizedError = new Error(String(originalError));
      try {
        normalizedError.cause = originalError;
      } catch {
        // Ignore if cause can't be set
      }
    }

    const appError: AppError = {
      message,
      category,
      severity,
      originalError: normalizedError,
      timestamp: Date.now(),
      context,
    };

    // Log to console
    const logLevel = severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH
      ? 'error'
      : 'warn';

    console[logLevel](`[${category.toUpperCase()}] ${message}`, {
      severity,
      originalError,
      context,
    });

    // Notify listeners
    this.errorListeners.forEach(listener => {
      try {
        listener(appError);
      } catch (err) {
        console.error('Error in error listener:', err);
      }
    });

    // Show user alert if callback is set
    if (this.userAlertCallback) {
      try {
        const userMessage = ErrorHandler.getUserMessage(appError);
        this.userAlertCallback(userMessage, severity);
      } catch (err) {
        console.error('Error in user alert callback:', err);
      }
    }

    return appError;
  }

  /**
   * Handle storage errors (AsyncStorage)
   */
  static handleStorageError(
    operation: string,
    error: unknown,
    context?: Record<string, any>
  ): AppError {
    return this.handle(
      `Failed to ${operation}`,
      error,
      ErrorCategory.STORAGE,
      ErrorSeverity.HIGH,
      context
    );
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(
    message: string,
    context?: Record<string, any>
  ): AppError {
    return this.handle(
      message,
      new Error(message),
      ErrorCategory.VALIDATION,
      ErrorSeverity.MEDIUM,
      context
    );
  }

  /**
   * Handle media loading errors
   */
  static handleMediaError(
    uri: string,
    error: unknown
  ): AppError {
    return this.handle(
      `Failed to load media: ${uri}`,
      error,
      ErrorCategory.MEDIA,
      ErrorSeverity.LOW,
      { uri }
    );
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(error: AppError): string {
    switch (error.category) {
      case ErrorCategory.STORAGE:
        return 'Не вдалося зберегти або завантажити дані. Перевірте доступний простір на пристрої.';
      case ErrorCategory.NETWORK:
        return 'Проблема з підключенням до мережі. Перевірте інтернет-з\'єднання.';
      case ErrorCategory.VALIDATION:
        return `Помилка валідації: ${error.message}`;
      case ErrorCategory.MEDIA:
        return 'Не вдалося завантажити медіа-файл. Файл може бути пошкоджений або відсутній.';
      case ErrorCategory.RENDERING:
        return 'Виникла помилка відображення. Спробуйте перезавантажити додаток.';
      default:
        return 'Виникла непередбачена помилка. Спробуйте ще раз.';
    }
  }
}

/**
 * Retry utility for async operations
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, onRetry } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      if (onRetry) {
        onRetry(attempt, error instanceof Error ? error : new Error(String(error)));
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw new Error('Retry failed'); // Should never reach here
}
