import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
import type { Session, SessionData } from 'express-session';
import { ensureSessionPersistence, getPersistedSessionId, getSessionId } from './auth.js';

vi.mock('../config/index.js', () => ({
  config: {
    auth: {
      sessionSecret: 'a'.repeat(32),
    },
    nodeEnv: 'development',
  },
  isAuthRequired: vi.fn(() => true),
}));

vi.mock('./security.js', () => ({
  shouldUseSecureCookies: vi.fn(() => false),
}));

describe('auth middleware helpers', () => {
  let mockReq: Partial<Request>;

  beforeEach(() => {
    mockReq = {
      session: {
        id: 'test-session-id',
        regenerate: vi.fn(),
        destroy: vi.fn(),
        reload: vi.fn(),
        save: vi.fn(),
        touch: vi.fn(),
        cookie: {},
      } as Session & Partial<SessionData>,
    };
  });

  it('returns the current Express session id', () => {
    expect(getSessionId(mockReq as Request)).toBe('test-session-id');
  });

  it('ensures the session is marked for persistence when server-side state needs it', () => {
    expect(mockReq.session?.persistedSessionId).toBeUndefined();

    ensureSessionPersistence(mockReq as Request);

    expect(mockReq.session?.persistedSessionId).toBe('test-session-id');
  });

  it('returns the session id while explicitly marking the session for persistence', () => {
    expect(getPersistedSessionId(mockReq as Request)).toBe('test-session-id');

    expect(mockReq.session?.persistedSessionId).toBe('test-session-id');
  });
});
