import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  logger,
  logMessage,
  scrubSensitiveData,
  encodeFinTS,
  generateMsgRef,
  formatFinTSDate,
} from './utils.js';

describe('FinTS utils', () => {
  describe('scrubSensitiveData', () => {
    it('should scrub PINs in HNSHA segments', () => {
      const input = "HNSHA:5:2+999++secret123'";
      const result = scrubSensitiveData(input);
      expect(result).toBe("HNSHA:5:2+999++█████████'");
      expect(result).not.toContain('secret123');
    });

    it('should scrub PIN and TAN values together in HNSHA segments', () => {
      const input = "HNSHA:5:2+999++secret123:tan456'";
      const result = scrubSensitiveData(input);
      expect(result).toBe("HNSHA:5:2+999++████████████████'");
      expect(result).not.toContain('secret123');
      expect(result).not.toContain('tan456');
    });

    it('should scrub user IDs and system IDs in HKIDN segments', () => {
      const input = "HKIDN:3:2+280:10020030+user?+name+SYS123+1'";
      const result = scrubSensitiveData(input);
      expect(result).toBe("HKIDN:3:2+280:10020030+██████████+██████+1'");
      expect(result).not.toContain('user?+name');
      expect(result).not.toContain('SYS123');
    });

    it('should scrub user IDs and system IDs in HNSHK segments', () => {
      const input =
        "HNSHK:2:4+PIN:1+999+7654321+1+1+1::SYS001+1+1:20260330:120000+1:999:1+6:10:16+280:10020030:user42:S:0:0'";
      const result = scrubSensitiveData(input);
      expect(result).toBe(
        "HNSHK:2:4+PIN:1+999+7654321+1+1+1::██████+1+1:20260330:120000+1:999:1+6:10:16+280:10020030:██████:S:0:0'"
      );
    });

    it('should scrub user IDs and system IDs in HNVSK segments', () => {
      const input =
        "HNVSK:998:3+PIN:1+998+1+1::SYS001+1:20260330:120000+2:2:13:@8@00000000:5:1+280:10020030:user42:V:0:0+0'";
      const result = scrubSensitiveData(input);
      expect(result).toBe(
        "HNVSK:998:3+PIN:1+998+1+1::██████+1:20260330:120000+2:2:13:@8@00000000:5:1+280:10020030:██████:V:0:0+0'"
      );
      expect(result).not.toContain('SYS001');
      expect(result).not.toContain('user42');
    });

    it('should scrub IBANs', () => {
      const input = 'Account: DE89370400440532013000';
      const result = scrubSensitiveData(input);
      expect(result).toBe('Account: DE████████████████████');
      expect(result).not.toContain('89370400440532013000');
    });

    it('should scrub national account numbers in account identifiers', () => {
      const input = "HKKAZ:5:7+1234567890::280:10020030+N+20240101+20240131++'";
      const result = scrubSensitiveData(input);
      expect(result).toBe("HKKAZ:5:7+██████████::280:10020030+N+20240101+20240131++'");
    });

    it('should fully redact sensitive response segments from the bank', () => {
      const input =
        "HIUPA:15:3:4+12345+4+0+Herr Meier'HIUPD:16:5:4+1234567:280:10020030+12345+1+EUR+Ernst Müller'HITAN:4:6:5+4++ORDER123+Bitte in App bestätigen'HIKAZ:4:6:3+@362@MT940DATA'";
      const result = scrubSensitiveData(input);
      expect(result).toBe("HIUPA:15:3:4+████'HIUPD:16:5:4+████'HITAN:4:6:5+████'HIKAZ:4:6:3+████'");
      expect(result).not.toContain('Herr Meier');
      expect(result).not.toContain('Ernst Müller');
      expect(result).not.toContain('ORDER123');
      expect(result).not.toContain('MT940DATA');
    });

    it('should leave non-sensitive bank metadata segments readable', () => {
      const input = "HIKOM:5:4:2+280:10020030+1+1:12345678:00+2:www.bankname.de::UUE:1'";
      const result = scrubSensitiveData(input);
      expect(result).toBe(input);
    });

    it('should scrub device/TAN medium names', () => {
      const input = 'DKB-App (Samsung SM-G991B)';
      const result = scrubSensitiveData(input);
      expect(result).toBe('DKB-App (████████████████)');
      expect(result).not.toContain('Samsung');
    });

    it('should scrub TAN-App names', () => {
      const input = 'TAN-App (iPhone 14)';
      const result = scrubSensitiveData(input);
      expect(result).toBe('TAN-App (█████████)');
    });

    it('should scrub Banking-App names', () => {
      const input = 'Banking-App (Pixel 7)';
      const result = scrubSensitiveData(input);
      expect(result).toBe('Banking-App (███████)');
    });

    it('should scrub generic app names', () => {
      const input = 'pushTAN-App (iPhone 15 Pro)';
      const result = scrubSensitiveData(input);
      expect(result).toBe('pushTAN-App (█████████████)');
    });

    it('should handle text without sensitive data', () => {
      const input = 'Hello World';
      const result = scrubSensitiveData(input);
      expect(result).toBe('Hello World');
    });

    it('should handle multiple sensitive items in one text', () => {
      const input =
        "HKIDN:3:2+280:10020030+user123+0+1'HNSHA:5:2+999++pin123'+DE89370400440532013000";
      const result = scrubSensitiveData(input);
      expect(result).not.toContain('user123');
      expect(result).not.toContain('pin123');
      expect(result).not.toContain('89370400440532013000');
    });
  });

  describe('redacting logger', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should scrub sensitive fields in structured log data', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('FinTS payload', {
        userId: 'user42',
        pin: '1234',
        tanMethodName: 'DKB-App (Pixel 8)',
      });

      const output = String(logSpy.mock.calls[0]?.[0] || '');
      expect(output).not.toContain('user42');
      expect(output).not.toContain('1234');
      expect(output).not.toContain('Pixel 8');
      expect(output).toContain('████');
    });

    it('should keep bank return messages while redacting sensitive FinTS segments', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logMessage(
        'info',
        'Transaction fetch response',
        "HNHBK:1:3+000000000211+300+000006KPOBQOU685HAUH5PQ580PPPF+1+000006KPOBQOU685HAUH5PQ580PPPF:1'HIRMG:2:2:+9800::Der Dialog wurde abgebrochen.+9010::Ungültiger Signaturaufbau?: Fehler im Segmentaufbau.'HIKAZ:4:6:3+@18@DE89370400440532013000'HNHBS:3:1+1'"
      );

      const output = String(logSpy.mock.calls[0]?.[0] || '');
      expect(output).toContain('Transaction fetch response: [redacted raw FinTS message;');
      expect(output).toContain('segmentTypes=HNHBKx1, HIRMGx1, HIKAZx1, HNHBSx1');
      expect(output).toContain('sensitive=HIKAZ@18');
      expect(output).toContain('returnCodes=9800, 9010');
      expect(output).toContain(
        'HIRMG:2:2:+9800::Der Dialog wurde abgebrochen.+9010::Ungültiger Signaturaufbau?: Fehler im Segmentaufbau.'
      );
      expect(output).toContain('HIKAZ:4:6:3+[redacted chars=');
      expect(output).toContain('binary=18]');
      expect(output).not.toContain('DE89370400440532013000');
      expect(output).not.toContain('@18@');
    });
  });

  describe('encodeFinTS', () => {
    it('should escape plus signs', () => {
      const result = encodeFinTS('hello+world');
      expect(result).toBe('hello?+world');
    });

    it('should escape colons', () => {
      const result = encodeFinTS('hello:world');
      expect(result).toBe('hello?:world');
    });

    it('should escape at signs', () => {
      const result = encodeFinTS('hello@world');
      expect(result).toBe('hello?@world');
    });

    it('should escape single quotes', () => {
      const result = encodeFinTS("hello'world");
      expect(result).toBe("hello?'world");
    });

    it('should escape multiple special characters', () => {
      const result = encodeFinTS("a+b:c@d'e");
      expect(result).toBe("a?+b?:c?@d?'e");
    });

    it('should not modify text without special characters', () => {
      const result = encodeFinTS('hello world');
      expect(result).toBe('hello world');
    });
  });

  describe('generateMsgRef', () => {
    it('should generate a 7-digit reference number', () => {
      const ref = generateMsgRef();
      expect(ref).toMatch(/^\d{7}$/);
    });

    it('should generate different references on subsequent calls', () => {
      const refs = new Set<string>();
      for (let i = 0; i < 10; i++) {
        refs.add(generateMsgRef());
      }
      // Most should be unique (there's a small chance of collision)
      expect(refs.size).toBeGreaterThan(5);
    });

    it('should pad short numbers with leading zeros', () => {
      // Mock Math.random to return a small number
      const originalRandom = Math.random;
      Math.random = () => 0.0000001; // Will generate a very small number

      const ref = generateMsgRef();
      expect(ref).toHaveLength(7);
      expect(ref).toMatch(/^0+\d+$/);

      Math.random = originalRandom;
    });
  });

  describe('formatFinTSDate', () => {
    it('should format Date object to YYYYMMDD', () => {
      const date = new Date('2024-01-15');
      const result = formatFinTSDate(date);
      expect(result).toBe('20240115');
    });

    it('should format date string to YYYYMMDD', () => {
      const result = formatFinTSDate('2024-01-15');
      expect(result).toBe('20240115');
    });

    it('should handle end of year dates', () => {
      const result = formatFinTSDate('2024-12-31');
      expect(result).toBe('20241231');
    });

    it('should handle beginning of year dates', () => {
      const result = formatFinTSDate('2024-01-01');
      expect(result).toBe('20240101');
    });

    it('should format ISO date strings', () => {
      const result = formatFinTSDate('2024-06-15T10:30:00Z');
      expect(result).toBe('20240615');
    });
  });
});
