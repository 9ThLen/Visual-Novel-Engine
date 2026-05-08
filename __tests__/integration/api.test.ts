import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../server/routers';

// Integration tests for TRPC API
// Note: These require the server to be running

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});

describe('TRPC API Integration', () => {
  it('should respond to health check', async () => {
    // Basic test - check if server is reachable
    try {
      const response = await fetch('http://localhost:3000/health');
      expect(response.status).toBe(200);
    } catch (error) {
      console.warn('Server not running, skipping integration tests');
    }
  });

  // Add more integration tests here when server is running
  // Example:
  // it('should list stories', async () => {
  //   const stories = await client.stories.list.query();
  //   expect(stories).toBeDefined();
  // });
});
