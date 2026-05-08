/**
 * State logging middleware for debugging and monitoring
 */

export interface StateLogEntry {
  timestamp: number;
  action: string;
  prevState?: any;
  nextState?: any;
  payload?: any;
}

export class StateLogger {
  private static logs: StateLogEntry[] = [];
  private static maxLogs = 100;
  private static enabled = __DEV__; // Only enable in development

  /**
   * Log a state change
   */
  static log(action: string, prevState: any, nextState: any, payload?: any): void {
    if (!this.enabled) return;

    const entry: StateLogEntry = {
      timestamp: Date.now(),
      action,
      prevState: this.sanitizeState(prevState),
      nextState: this.sanitizeState(nextState),
      payload: this.sanitizePayload(payload),
    };

    this.logs.push(entry);

    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console log in development
    if (__DEV__) {
      console.group(`%c[STATE] ${action}`, 'color: #4CAF50; font-weight: bold');
      console.log('%cPrevious State:', 'color: #9E9E9E', prevState);
      console.log('%cAction Payload:', 'color: #2196F3', payload);
      console.log('%cNext State:', 'color: #4CAF50', nextState);
      console.groupEnd();
    }
  }

  /**
   * Get all logs
   */
  static getLogs(): StateLogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear all logs
   */
  static clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs as JSON
   */
  static exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Enable/disable logging
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Set maximum number of logs to keep
   */
  static setMaxLogs(max: number): void {
    this.maxLogs = max;
  }

  /**
   * Sanitize state to remove sensitive data
   */
  private static sanitizeState(state: any): any {
    if (!state) return state;

    // Create a shallow copy
    const sanitized = { ...state };

    // Remove or mask sensitive fields
    if (sanitized.settings?.password) {
      sanitized.settings = { ...sanitized.settings, password: '***' };
    }

    return sanitized;
  }

  /**
   * Sanitize payload to remove sensitive data
   */
  private static sanitizePayload(payload: any): any {
    if (!payload) return payload;

    // Create a shallow copy
    const sanitized = { ...payload };

    // Remove or mask sensitive fields
    if (sanitized.password) {
      sanitized.password = '***';
    }
    if (sanitized.token) {
      sanitized.token = '***';
    }

    return sanitized;
  }

  /**
   * Get logs filtered by action type
   */
  static getLogsByAction(action: string): StateLogEntry[] {
    return this.logs.filter(log => log.action === action);
  }

  /**
   * Get logs within a time range
   */
  static getLogsByTimeRange(startTime: number, endTime: number): StateLogEntry[] {
    return this.logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
  }

  /**
   * Get statistics about state changes
   */
  static getStats(): {
    totalLogs: number;
    actionCounts: Record<string, number>;
    timeRange: { start: number; end: number } | null;
  } {
    const actionCounts: Record<string, number> = {};

    this.logs.forEach(log => {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    });

    const timeRange = this.logs.length > 0
      ? {
          start: this.logs[0].timestamp,
          end: this.logs[this.logs.length - 1].timestamp,
        }
      : null;

    return {
      totalLogs: this.logs.length,
      actionCounts,
      timeRange,
    };
  }
}

/**
 * Middleware wrapper for reducer
 */
export function withLogging<S, A extends { type: string }>(
  reducer: (state: S, action: A) => S
): (state: S, action: A) => S {
  return (state: S, action: A): S => {
    const nextState = reducer(state, action);
    StateLogger.log(action.type, state, nextState, action);
    return nextState;
  };
}
