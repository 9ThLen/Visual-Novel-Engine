import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorCategory, ErrorHandler, ErrorSeverity } from '@/lib/error-handler';

function HealthyChild() {
  return <div>Recovered child</div>;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ErrorHandler.clearListeners();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    ErrorHandler.clearListeners();
  });

  it('renders fallback UI, reports the error, and resets on retry', () => {
    const handled = vi.fn();
    ErrorHandler.addListener(handled);

    let shouldThrow = true;
    function MaybeCrashingChild() {
      if (shouldThrow) throw new Error('render failed');
      return <HealthyChild />;
    }

    render(
      <ErrorBoundary>
        <MaybeCrashingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/render failed/)).toBeTruthy();
    expect(handled).toHaveBeenCalledWith(
      expect.objectContaining({
        category: ErrorCategory.RENDERING,
        severity: ErrorSeverity.HIGH,
      }),
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Recovered child')).toBeTruthy();
  });
});

