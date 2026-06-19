import { ErrorHandler, ErrorSeverity, ErrorCategory } from '@/lib/error-handler';

describe('ErrorHandler', () => {
  it('should have correct severity levels', () => {
    expect(ErrorSeverity.LOW).toBe('low');
    expect(ErrorSeverity.MEDIUM).toBe('medium');
    expect(ErrorSeverity.HIGH).toBe('high');
    expect(ErrorSeverity.CRITICAL).toBe('critical');
  });

  it('should have correct categories', () => {
    expect(ErrorCategory.STORAGE).toBe('storage');
    expect(ErrorCategory.NETWORK).toBe('network');
    expect(ErrorCategory.VALIDATION).toBe('validation');
    expect(ErrorCategory.RENDERING).toBe('rendering');
    expect(ErrorCategory.MEDIA).toBe('media');
    expect(ErrorCategory.UNKNOWN).toBe('unknown');
  });

  it('should handle errors without throwing', () => {
    expect(() => {
      ErrorHandler.handle('test error', new Error('test'), ErrorCategory.UNKNOWN);
    }).not.toThrow();
  });

  it('should handle string errors without throwing', () => {
    expect(() => {
      ErrorHandler.handle('string error', 'some string error', ErrorCategory.NETWORK);
    }).not.toThrow();
  });

  it('should handle null/undefined errors without throwing', () => {
    expect(() => {
      ErrorHandler.handle('null error', null, ErrorCategory.STORAGE);
    }).not.toThrow();
  });
});
