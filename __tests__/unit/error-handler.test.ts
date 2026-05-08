import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ErrorHandler,
  ErrorSeverity,
  ErrorCategory,
  type AppError,
  retryAsync,
} from '../../lib/error-handler';

describe('ErrorHandler', () => {
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Clear listeners before each test
    // @ts-ignore - accessing private property for testing
    ErrorHandler.errorListeners = [];
    
    // Spy on console methods
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addListener', () => {
    it('should add a listener and return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = ErrorHandler.addListener(listener);
      
      expect(typeof unsubscribe).toBe('function');
      
      // Trigger an error to see if listener is called
      ErrorHandler.handle('test', new Error('test'), ErrorCategory.UNKNOWN, ErrorSeverity.LOW);
      
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should remove listener when unsubscribe is called', () => {
      const listener = vi.fn();
      const unsubscribe = ErrorHandler.addListener(listener);
      
      unsubscribe();
      
      ErrorHandler.handle('test', new Error('test'), ErrorCategory.UNKNOWN, ErrorSeverity.LOW);
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('handle', () => {
    it('should create an AppError with correct properties', () => {
      const originalError = new Error('Original error');
      const context = { key: 'value' };
      
      const appError = ErrorHandler.handle(
        'Test message',
        originalError,
        ErrorCategory.NETWORK,
        ErrorSeverity.HIGH,
        context
      );

      expect(appError.message).toBe('Test message');
      expect(appError.category).toBe(ErrorCategory.NETWORK);
      expect(appError.severity).toBe(ErrorSeverity.HIGH);
      expect(appError.originalError).toBe(originalError);
      expect(appError.context).toEqual(context);
      expect(appError.timestamp).toBeDefined();
      expect(typeof appError.timestamp).toBe('number');
    });

    it('should handle non-Error objects as originalError', () => {
      const appError = ErrorHandler.handle(
        'Test',
        'string error',
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW
      );

      expect(appError.originalError).toBeDefined();
      expect(appError.originalError).toBeInstanceOf(Error);
      if (appError.originalError instanceof Error) {
        expect(appError.originalError.message).toBe('string error');
      }
    });

    it('should log to console.error for HIGH severity', () => {
      ErrorHandler.handle('High error', new Error('err'), ErrorCategory.UNKNOWN, ErrorSeverity.HIGH);
      
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log to console.warn for MEDIUM severity', () => {
      ErrorHandler.handle('Medium error', new Error('err'), ErrorCategory.UNKNOWN, ErrorSeverity.MEDIUM);
      
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should notify all listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      
      ErrorHandler.addListener(listener1);
      ErrorHandler.addListener(listener2);
      
      ErrorHandler.handle('Test', new Error('test'), ErrorCategory.UNKNOWN, ErrorSeverity.LOW);
      
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleStorageError', () => {
    it('should create storage error with HIGH severity', () => {
      const error = new Error('Storage failed');
      const appError = ErrorHandler.handleStorageError('save data', error, { key: 'test' });

      expect(appError.category).toBe(ErrorCategory.STORAGE);
      expect(appError.severity).toBe(ErrorSeverity.HIGH);
      expect(appError.message).toBe('Failed to save data');
      expect(appError.context).toEqual({ key: 'test' });
    });
  });

  describe('handleValidationError', () => {
    it('should create validation error with MEDIUM severity', () => {
      const appError = ErrorHandler.handleValidationError('Invalid input', { field: 'email' });

      expect(appError.category).toBe(ErrorCategory.VALIDATION);
      expect(appError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(appError.message).toBe('Invalid input');
      expect(appError.context).toEqual({ field: 'email' });
    });
  });

  describe('handleMediaError', () => {
    it('should create media error with LOW severity', () => {
      const error = new Error('Load failed');
      const appError = ErrorHandler.handleMediaError('image.png', error);

      expect(appError.category).toBe(ErrorCategory.MEDIA);
      expect(appError.severity).toBe(ErrorSeverity.LOW);
      expect(appError.message).toBe('Failed to load media: image.png');
      expect(appError.context).toEqual({ uri: 'image.png' });
    });
  });

  describe('getUserMessage', () => {
    it('should return Ukrainian message for STORAGE errors', () => {
      const error: AppError = {
        message: 'test',
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.HIGH,
        timestamp: Date.now(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toContain('зберегти або завантажити дані');
    });

    it('should return Ukrainian message for NETWORK errors', () => {
      const error: AppError = {
        message: 'test',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        timestamp: Date.now(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toContain('підключенням до мережі');
    });

    it('should return Ukrainian message for VALIDATION errors with message', () => {
      const error: AppError = {
        message: 'Invalid email',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        timestamp: Date.now(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toContain('Помилка валідації');
    });

    it('should return Ukrainian message for MEDIA errors', () => {
      const error: AppError = {
        message: 'test',
        category: ErrorCategory.MEDIA,
        severity: ErrorSeverity.LOW,
        timestamp: Date.now(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toContain('завантажити медіа-файл');
    });

    it('should return default message for unknown category', () => {
      const error: AppError = {
        message: 'test',
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        timestamp: Date.now(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toContain('непередбачена помилка');
    });
  });
});

describe('retryAsync', () => {
  it('should return result on first try if successful', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    
    const result = await retryAsync(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success after retries');
    
    const result = await retryAsync(fn, { maxRetries: 3, delayMs: 10 });
    
    expect(result).toBe('success after retries');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after all retries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    
    await expect(retryAsync(fn, { maxRetries: 2, delayMs: 10 }))
      .rejects.toThrow('always fails');
    
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should call onRetry callback when retry happens', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');
    
    await retryAsync(fn, { maxRetries: 3, delayMs: 10, onRetry });
    
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('should use default options when not provided', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    
    const result = await retryAsync(fn);
    
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
