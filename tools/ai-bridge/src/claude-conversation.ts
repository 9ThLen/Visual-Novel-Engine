export class ClaudeConversation {
  private sessionId: string | null = null;

  withResume<T extends object>(options: T): T & { resume?: string } {
    return this.sessionId ? { ...options, resume: this.sessionId } : options;
  }

  observe(message: { session_id?: unknown }): void {
    if (typeof message.session_id === 'string') this.sessionId = message.session_id;
  }

  reset(): void {
    this.sessionId = null;
  }
}
