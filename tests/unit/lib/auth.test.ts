/**
 * Unit tests for lib/_core/auth.ts
 */


// Mock expo-secure-store
vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  getItemAsync: vi.fn().mockResolvedValue(null),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

// Mock expo-linking
vi.mock('expo-linking', () => ({
  canOpenURL: vi.fn().mockResolvedValue(true),
  openURL: vi.fn().mockResolvedValue(undefined),
}));

// Mock constants/oauth
vi.mock('@/constants/oauth', () => ({
  SESSION_TOKEN_KEY: 'session_token',
  USER_INFO_KEY: 'user_info',
  OAUTH_STATE_KEY: 'oauth_state',
  getLoginUrl: vi.fn((state: string) => `https://example.com/login?state=${state}`),
}));

// Mock error-handler
vi.mock('@/lib/error-handler', () => ({
  ErrorHandler: {
    handle: vi.fn(),
    handleValidationError: vi.fn((msg: string) => {
      const err = new Error(msg);
      err.name = 'ValidationError';
      return err;
    }),
  },
  ErrorCategory: {
    STORAGE: 'storage',
    NETWORK: 'network',
  },
  ErrorSeverity: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  },
}));

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isValidUser', () => {
    it('should return true for valid user object', async () => {
      const { isValidUser } = await import('@/lib/_core/auth');
      const validUser = {
        id: 1,
        openId: 'abc123',
        name: 'Test User',
        email: 'test@example.com',
        loginMethod: 'google',
        lastSignedIn: new Date(),
      };
      expect(isValidUser(validUser)).toBe(true);
    });

    it('should return true for valid user with null optional fields', async () => {
      const { isValidUser } = await import('@/lib/_core/auth');
      const validUser = {
        id: 1,
        openId: 'abc123',
        name: null,
        email: null,
        loginMethod: null,
        lastSignedIn: new Date(),
      };
      expect(isValidUser(validUser)).toBe(true);
    });

    it('should return true for user with lastSignedIn as date string', async () => {
      const { isValidUser } = await import('@/lib/_core/auth');
      const validUser = {
        id: 1,
        openId: 'abc123',
        name: null,
        email: null,
        loginMethod: null,
        lastSignedIn: '2024-01-15T10:30:00.000Z',
      };
      expect(isValidUser(validUser)).toBe(true);
    });

    it('should return false for null', async () => {
      const { isValidUser } = await import('@/lib/_core/auth');
      expect(isValidUser(null)).toBe(false);
    });

    it('should return false for non-object', async () => {
      const { isValidUser } = await import('@/lib/_core/auth');
      expect(isValidUser('string')).toBe(false);
      expect(isValidUser(123)).toBe(false);
      expect(isValidUser(undefined)).toBe(false);
    });

    it('should return false for missing id', async () => {
      const { isValidUser } = await import('@/lib/_core/auth');
      expect(isValidUser({
        openId: 'abc',
        name: null,
        email: null,
        loginMethod: null,
        lastSignedIn: new Date(),
      })).toBe(false);
    });

    it('should return false for missing openId', async () => {
      const { isValidUser } = await import('@/lib/_core/auth');
      expect(isValidUser({
        id: 1,
        name: null,
        email: null,
        loginMethod: null,
        lastSignedIn: new Date(),
      })).toBe(false);
    });

    it('should return false for invalid lastSignedIn', async () => {
      const { isValidUser } = await import('@/lib/_core/auth');
      expect(isValidUser({
        id: 1,
        openId: 'abc',
        name: null,
        email: null,
        loginMethod: null,
        lastSignedIn: 'not-a-date',
      })).toBe(false);
    });

    it('should return false for invalid name type', async () => {
      const { isValidUser } = await import('@/lib/_core/auth');
      expect(isValidUser({
        id: 1,
        openId: 'abc',
        name: 123,
        email: null,
        loginMethod: null,
        lastSignedIn: new Date(),
      })).toBe(false);
    });
  });

  describe('generateOAuthState', () => {
    it('should generate a non-empty state string', async () => {
      const { generateOAuthState } = await import('@/lib/_core/auth');
      const state = await generateOAuthState();
      expect(state).toBeTruthy();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0);
    });

    it('should generate unique states', async () => {
      const { generateOAuthState } = await import('@/lib/_core/auth');
      const state1 = await generateOAuthState();
      const state2 = await generateOAuthState();
      expect(state1).not.toBe(state2);
    });
  });
});
