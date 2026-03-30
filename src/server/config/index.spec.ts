import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfigWithEnv(flag?: string) {
  vi.resetModules();

  if (flag === undefined) {
    delete process.env.FINTS_LOG_REDACTION;
  } else {
    process.env.FINTS_LOG_REDACTION = flag;
  }

  return import('./index.js');
}

describe('server config', () => {
  afterEach(() => {
    delete process.env.FINTS_LOG_REDACTION;
    vi.resetModules();
  });

  it('does not warn when FinTS log redaction is enabled by default', async () => {
    const { validateConfig } = await loadConfigWithEnv();

    expect(validateConfig().warnings).not.toContain(
      'FINTS_LOG_REDACTION is disabled. FinTS debug logs may contain raw bank payloads, account data, and transaction details.'
    );
  });

  it('warns when FinTS log redaction is explicitly disabled', async () => {
    const { validateConfig } = await loadConfigWithEnv('false');

    expect(validateConfig().warnings).toContain(
      'FINTS_LOG_REDACTION is disabled. FinTS debug logs may contain raw bank payloads, account data, and transaction details.'
    );
  });
});
