import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadUtilsWithEnv(flag?: string) {
  vi.resetModules();

  if (flag === undefined) {
    delete process.env.FINTS_LOG_REDACTION;
  } else {
    process.env.FINTS_LOG_REDACTION = flag;
  }

  return import('./utils.js');
}

describe('FinTS log redaction toggle', () => {
  afterEach(() => {
    delete process.env.FINTS_LOG_REDACTION;
    vi.resetModules();
  });

  it('keeps redaction enabled by default', async () => {
    const { scrubSensitiveData } = await loadUtilsWithEnv();
    const input = "HNSHA:5:2+999++secret123'";

    expect(scrubSensitiveData(input)).toBe("HNSHA:5:2+999++█████████'");
  });

  it('can be explicitly disabled via FINTS_LOG_REDACTION=false', async () => {
    const { scrubSensitiveData } = await loadUtilsWithEnv('false');
    const input = "HNSHA:5:2+999++secret123'";

    expect(scrubSensitiveData(input)).toBe(input);
  });

  it('continues to log raw sensitive message bodies when redaction is explicitly disabled', async () => {
    const { logMessage } = await loadUtilsWithEnv('false');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logMessage(
      'debug',
      'Transaction fetch response',
      "HNHBK:1:3+000000000123+300+1+1'HIKAZ:4:6:3+@18@DE89370400440532013000'"
    );

    const output = String(logSpy.mock.calls[0]?.[0] || '');
    expect(output).toContain("Transaction fetch response:\nHNHBK:1:3+000000000123+300+1+1'HIKAZ:4:6:3+@18@DE89370400440532013000'");
  });
});
