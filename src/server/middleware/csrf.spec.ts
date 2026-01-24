import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import {
  csrfProtection,
  csrfTokenCookie,
  getOrCreateCsrfToken,
  CSRF_TOKEN_HEADER,
  CSRF_COOKIE_NAME,
} from './csrf.js';

// Mock the config module
vi.mock('../config/index.js', () => ({
  config: {
    corsOrigins: ['http://localhost:5173', 'http://localhost:3000'],
    nodeEnv: 'development',
  },
  isAuthRequired: vi.fn(() => true),
}));

// Import the mocked function for control
import { isAuthRequired } from '../config/index.js';

describe('CSRF Protection Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;
  let cookieSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnThis();
    cookieSpy = vi.fn();

    mockReq = {
      method: 'POST',
      get: vi.fn(),
      session: {
        id: 'test-session-id',
        csrfToken: undefined,
        regenerate: vi.fn(),
        destroy: vi.fn(),
        reload: vi.fn(),
        save: vi.fn(),
        touch: vi.fn(),
        cookie: {},
      } as Session & Partial<SessionData>,
    };

    mockRes = {
      status: statusSpy,
      json: jsonSpy,
      cookie: cookieSpy,
    };

    mockNext = vi.fn();

    // Reset the mock to return true (auth required)
    vi.mocked(isAuthRequired).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('csrfProtection', () => {
    it('should skip CSRF check for safe methods (GET)', () => {
      mockReq.method = 'GET';

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should skip CSRF check for safe methods (HEAD)', () => {
      mockReq.method = 'HEAD';

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should skip CSRF check for safe methods (OPTIONS)', () => {
      mockReq.method = 'OPTIONS';

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should skip CSRF check when auth is not required', () => {
      vi.mocked(isAuthRequired).mockReturnValue(false);
      mockReq.method = 'POST';

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should reject POST without Origin or Referer header', () => {
      mockReq.method = 'POST';
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Missing Origin or Referer header',
      });
    });

    it('should reject POST with invalid Origin', () => {
      mockReq.method = 'POST';
      (mockReq.get as ReturnType<typeof vi.fn>).mockImplementation((header: string) => {
        if (header === 'Origin') return 'http://evil.com';
        return undefined;
      });

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid origin',
      });
    });

    it('should accept valid Origin from CORS origins list', () => {
      const csrfToken = 'valid-csrf-token';
      mockReq.method = 'POST';
      mockReq.session!.csrfToken = csrfToken;
      (mockReq.get as ReturnType<typeof vi.fn>).mockImplementation((header: string) => {
        if (header === 'Origin') return 'http://localhost:5173';
        if (header === CSRF_TOKEN_HEADER) return csrfToken;
        return undefined;
      });

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should extract origin from Referer when Origin is missing', () => {
      const csrfToken = 'valid-csrf-token';
      mockReq.method = 'POST';
      mockReq.session!.csrfToken = csrfToken;
      (mockReq.get as ReturnType<typeof vi.fn>).mockImplementation((header: string) => {
        if (header === 'Referer') return 'http://localhost:3000/some/path';
        if (header === CSRF_TOKEN_HEADER) return csrfToken;
        return undefined;
      });

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should reject POST with missing CSRF token in header', () => {
      mockReq.method = 'POST';
      mockReq.session!.csrfToken = 'session-token';
      (mockReq.get as ReturnType<typeof vi.fn>).mockImplementation((header: string) => {
        if (header === 'Origin') return 'http://localhost:5173';
        return undefined;
      });

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Missing CSRF token',
      });
    });

    it('should reject POST with missing CSRF token in session', () => {
      mockReq.method = 'POST';
      (mockReq.get as ReturnType<typeof vi.fn>).mockImplementation((header: string) => {
        if (header === 'Origin') return 'http://localhost:5173';
        if (header === CSRF_TOKEN_HEADER) return 'header-token';
        return undefined;
      });

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Missing CSRF token',
      });
    });

    it('should reject POST with mismatched CSRF token', () => {
      mockReq.method = 'POST';
      mockReq.session!.csrfToken = 'session-token';
      (mockReq.get as ReturnType<typeof vi.fn>).mockImplementation((header: string) => {
        if (header === 'Origin') return 'http://localhost:5173';
        if (header === CSRF_TOKEN_HEADER) return 'different-header-token';
        return undefined;
      });

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid CSRF token',
      });
    });

    it('should accept POST with valid Origin and matching CSRF token', () => {
      const csrfToken = 'valid-csrf-token-12345';
      mockReq.method = 'POST';
      mockReq.session!.csrfToken = csrfToken;
      (mockReq.get as ReturnType<typeof vi.fn>).mockImplementation((header: string) => {
        if (header === 'Origin') return 'http://localhost:5173';
        if (header === CSRF_TOKEN_HEADER) return csrfToken;
        return undefined;
      });

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should handle PUT, DELETE, PATCH methods', () => {
      const csrfToken = 'valid-csrf-token';

      for (const method of ['PUT', 'DELETE', 'PATCH']) {
        mockReq.method = method;
        mockReq.session!.csrfToken = csrfToken;
        (mockReq.get as ReturnType<typeof vi.fn>).mockImplementation((header: string) => {
          if (header === 'Origin') return 'http://localhost:5173';
          if (header === CSRF_TOKEN_HEADER) return csrfToken;
          return undefined;
        });

        csrfProtection(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      }
    });

    it('should normalize origin with trailing slash', () => {
      const csrfToken = 'valid-csrf-token';
      mockReq.method = 'POST';
      mockReq.session!.csrfToken = csrfToken;
      (mockReq.get as ReturnType<typeof vi.fn>).mockImplementation((header: string) => {
        if (header === 'Origin') return 'http://localhost:5173/';
        if (header === CSRF_TOKEN_HEADER) return csrfToken;
        return undefined;
      });

      csrfProtection(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('csrfTokenCookie', () => {
    it('should skip setting cookie when auth is not required', () => {
      vi.mocked(isAuthRequired).mockReturnValue(false);

      csrfTokenCookie(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });

    it('should set CSRF token cookie when auth is required', () => {
      csrfTokenCookie(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(cookieSpy).toHaveBeenCalledWith(
        CSRF_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          sameSite: 'lax',
          path: '/',
        })
      );
    });

    it('should create CSRF token in session if not present', () => {
      expect(mockReq.session!.csrfToken).toBeUndefined();

      csrfTokenCookie(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.session!.csrfToken).toBeDefined();
      expect(typeof mockReq.session!.csrfToken).toBe('string');
      expect(mockReq.session!.csrfToken!.length).toBeGreaterThan(0);
    });
  });

  describe('getOrCreateCsrfToken', () => {
    it('should create new token if not present in session', () => {
      expect(mockReq.session!.csrfToken).toBeUndefined();

      const token = getOrCreateCsrfToken(mockReq as Request);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes * 2 (hex encoding)
      expect(mockReq.session!.csrfToken).toBe(token);
    });

    it('should return existing token if present in session', () => {
      const existingToken = 'existing-csrf-token';
      mockReq.session!.csrfToken = existingToken;

      const token = getOrCreateCsrfToken(mockReq as Request);

      expect(token).toBe(existingToken);
    });

    it('should generate unique tokens for each new session', () => {
      const token1 = getOrCreateCsrfToken(mockReq as Request);

      // Create new session
      mockReq.session = {
        id: 'another-session-id',
        csrfToken: undefined,
        regenerate: vi.fn(),
        destroy: vi.fn(),
        reload: vi.fn(),
        save: vi.fn(),
        touch: vi.fn(),
        cookie: {},
      } as Session & Partial<SessionData>;

      const token2 = getOrCreateCsrfToken(mockReq as Request);

      expect(token1).not.toBe(token2);
    });
  });
});
