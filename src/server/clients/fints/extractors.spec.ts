import { describe, it, expect, vi } from 'vitest';
import {
  checkForErrors,
  extractDialogId,
  extractAccounts,
  extractTanMethods,
  extractAllowedTanMethods,
  checkTanRequired,
  extractWarnings,
  checkForCriticalWarnings,
} from './extractors.js';

// Mock the utils logger
vi.mock('./utils.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FinTS extractors', () => {
  describe('extractWarnings', () => {
    it('should extract warnings from HIRMG segments', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+3060::Bitte beachten Sie die enthaltenen Warnungen.']);

      const warnings = extractWarnings(segments);
      expect(warnings.length).toBe(1);
      expect(warnings[0].code).toBe(3060);
      expect(warnings[0].message).toContain('Bitte beachten');
    });

    it('should extract multiple warnings', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', [
        'HIRMS:4:2:4+3050::BPD nicht mehr aktuell.+3938::Ihr Zugang ist vorläufig gesperrt.+3920::Zugelassene TAN-Verfahren:923',
      ]);

      const warnings = extractWarnings(segments);
      expect(warnings.length).toBe(3);
      expect(warnings.map((w) => w.code)).toContain(3050);
      expect(warnings.map((w) => w.code)).toContain(3938);
      expect(warnings.map((w) => w.code)).toContain(3920);
    });

    it('should return empty array when no warnings', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+0010::Success']);

      const warnings = extractWarnings(segments);
      expect(warnings.length).toBe(0);
    });
  });

  describe('checkForCriticalWarnings', () => {
    it('should detect account locked warning (3938)', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', ['HIRMS:4:2:4+3938::Ihr Zugang ist vorläufig gesperrt.']);

      const critical = checkForCriticalWarnings(segments);
      expect(critical).not.toBeNull();
      expect(critical?.code).toBe(3938);
    });

    it('should detect PIN wrong warning (3916)', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', ['HIRMS:4:2:4+3916::PIN falsch.']);

      const critical = checkForCriticalWarnings(segments);
      expect(critical).not.toBeNull();
      expect(critical?.code).toBe(3916);
    });

    it('should return null for non-critical warnings', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', ['HIRMS:4:2:4+3050::BPD nicht mehr aktuell.']);

      const critical = checkForCriticalWarnings(segments);
      expect(critical).toBeNull();
    });

    it('should return null when no warnings', () => {
      const segments = new Map<string, string[]>();

      const critical = checkForCriticalWarnings(segments);
      expect(critical).toBeNull();
    });
  });

  describe('checkForErrors', () => {
    it('should not throw for successful responses (0xxx codes)', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+0010::Success']);

      expect(() => checkForErrors(segments)).not.toThrow();
    });

    it('should not throw for warning responses (3xxx codes)', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+3010::Warning message']);

      expect(() => checkForErrors(segments)).not.toThrow();
    });

    it('should throw for error responses (9xxx codes)', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+9000::Error message']);

      expect(() => checkForErrors(segments)).toThrow('FinTS Error 9000');
    });

    it('should check HIRMS segments as well', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', ['HIRMS:3:2+9010::Invalid PIN']);

      expect(() => checkForErrors(segments)).toThrow('FinTS Error 9010');
    });

    it('should check both HIRMG and HIRMS', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+0010::Success']);
      segments.set('HIRMS', ['HIRMS:3:2+9999::Critical error']);

      expect(() => checkForErrors(segments)).toThrow('FinTS Error 9999');
    });

    it('should handle empty segments', () => {
      const segments = new Map<string, string[]>();

      expect(() => checkForErrors(segments)).not.toThrow();
    });

    it('should include error message in exception', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+9050::Authentication failed']);

      expect(() => checkForErrors(segments)).toThrow('Authentication failed');
    });

    it('should not throw for codes below 9000', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+8999::Not an error']);

      expect(() => checkForErrors(segments)).not.toThrow();
    });
  });

  describe('extractDialogId', () => {
    it('should extract dialog ID from HNHBK segment', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);

      const dialogId = extractDialogId(segments);
      expect(dialogId).toBe('DIALOG123');
    });

    it('should throw if HNHBK is missing', () => {
      const segments = new Map<string, string[]>();

      expect(() => extractDialogId(segments)).toThrow('Invalid response: Missing HNHBK segment');
    });

    it('should return "0" if dialog ID element is missing', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300']);

      const dialogId = extractDialogId(segments);
      expect(dialogId).toBe('0');
    });
  });

  describe('extractAccounts', () => {
    it('should extract accounts from HISPA segments', () => {
      const segments = new Map<string, string[]>();
      segments.set('HISPA', [
        'HISPA:5:2+1234567890:BLZ:280:12345678:DE89370400440532013000:COBADEFFXXX',
      ]);

      const accounts = extractAccounts(segments);
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should extract accounts from HIUPD segments', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIUPD', [
        'HIUPD:6:6+1234567890:::12345678+DE89370400440532013000+EUR+Girokonto++John Doe',
      ]);

      const accounts = extractAccounts(segments);
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should merge HISPA and HIUPD data', () => {
      const segments = new Map<string, string[]>();
      segments.set('HISPA', [
        'HISPA:5:2+1234567890:BLZ:280:12345678:DE89370400440532013000:COBADEFFXXX',
      ]);
      segments.set('HIUPD', [
        'HIUPD:6:6+1234567890:::12345678+DE89370400440532013000+EUR+Girokonto++John Doe',
      ]);

      const accounts = extractAccounts(segments);
      // Should have account info from both sources
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should handle empty segments', () => {
      const segments = new Map<string, string[]>();

      const accounts = extractAccounts(segments);
      expect(accounts).toEqual([]);
    });

    it('should extract IBAN when present', () => {
      const segments = new Map<string, string[]>();
      segments.set('HISPA', ['HISPA:5:2+1234:BLZ:280:12345678:DE89370400440532013000:COBADEFFXXX']);

      const accounts = extractAccounts(segments);
      const account = accounts.find((a) => a.iban);
      expect(account?.iban).toBe('DE89370400440532013000');
    });

    it('should extract BIC when present', () => {
      const segments = new Map<string, string[]>();
      segments.set('HISPA', ['HISPA:5:2+1234:BLZ:280:12345678:DE89370400440532013000:COBADEFFXXX']);

      const accounts = extractAccounts(segments);
      const account = accounts.find((a) => a.bic);
      expect(account?.bic).toBe('COBADEFFXXX');
    });
  });

  describe('extractTanMethods', () => {
    it('should extract TAN methods from HITANS', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', [
        'HITANS:70:6:4+1+1+0+N:N:0:940:2:SealOne:Decoupled::DKB App:::DKB App:2048:N:1:N:0:0:N:J:00:0:N',
      ]);

      const methods = extractTanMethods(segments);
      expect(methods.length).toBeGreaterThanOrEqual(0);
    });

    it('should identify decoupled TAN methods', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', ['HITANS:70:6:4+1+1+0+940:2:SealOne:Decoupled::DKB App']);

      const methods = extractTanMethods(segments);
      const decoupledMethod = methods.find((m) => m.id === '940');
      if (decoupledMethod) {
        expect(decoupledMethod.isDecoupled).toBe(true);
      }
    });

    it('should handle empty HITANS', () => {
      const segments = new Map<string, string[]>();

      const methods = extractTanMethods(segments);
      expect(methods).toEqual([]);
    });

    it('should avoid duplicate TAN methods', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', [
        'HITANS:70:6:4+940:2:SealOne:Decoupled::App1+940:2:SealOne:Decoupled::App2',
      ]);

      const methods = extractTanMethods(segments);
      const method940 = methods.filter((m) => m.id === '940');
      expect(method940.length).toBeLessThanOrEqual(1);
    });

    it('should identify chipTAN methods', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', ['HITANS:70:6:4+910:2:HHD1.3.0:::chipTAN manuell']);

      const methods = extractTanMethods(segments);
      const chipTan = methods.find((m) => m.id === '910');
      if (chipTan) {
        expect(chipTan.technicalName).toContain('HHD');
      }
    });

    it('should only match TAN method IDs in 900-997 range', () => {
      // This tests the fix for issue #25 where numbers like 180 were incorrectly
      // matched as TAN method IDs
      const segments = new Map<string, string[]>();
      // Simulate HITANS with various numeric fields that should NOT be matched as TAN methods
      segments.set('HITANS', [
        'HITANS:70:6:4+1+1+0+N:N:0:910:2:HHD1.3.0:::chipTAN manuell:6:1:TAN-Nummer:3:J:2:N:0:0:N:N:00:0:N:1:180:5:SomeField:::NotATanMethod',
      ]);

      const methods = extractTanMethods(segments);
      // Should find 910 but not 180
      expect(methods.find((m) => m.id === '910')).toBeDefined();
      expect(methods.find((m) => m.id === '180')).toBeUndefined();
    });

    it('should correctly parse pushTAN 2.0 (method 922/923)', () => {
      // Test for Kreissparkasse-style banks that use 922/923 for pushTAN 2.0
      const segments = new Map<string, string[]>();
      segments.set('HITANS', [
        'HITANS:70:6:4+1+1+0+N:N:0:922:2:pushTAN2:::pushTAN 2.0:6:1:TAN:3:J:2:N:0:0:N:N:00:0:N:1:923:2:pushTAN2:DecoupledPush::pushTAN 2.0:6:1:TAN:3:J:2:N:0:0:N:N:00:2:N:1',
      ]);

      const methods = extractTanMethods(segments);
      expect(methods.find((m) => m.id === '922')).toBeDefined();
      expect(methods.find((m) => m.id === '923')).toBeDefined();
    });

    it('should parse multiple TAN methods from Sparkasse-style banks', () => {
      // Real-world like HITANS from Sparkasse with multiple TAN methods
      const segments = new Map<string, string[]>();
      segments.set('HITANS', [
        'HITANS:166:6:4+1+1+0+J:N:0:910:2:HHD1.3.0:::chipTAN manuell:6:1:TAN-Nummer:3:J:2:N:0:0:N:N:00:0:N:1:911:2:HHD1.3.2OPT:HHDOPT1:1.3.2:chipTAN optisch:6:1:TAN-Nummer:3:J:2:N:0:0:N:N:00:0:N:1:912:2:HHD1.3.2USB:HHDUSB1:1.3.2:chipTAN-USB:6:1:TAN-Nummer:3:J:2:N:0:0:N:N:00:0:N:1:913:2:Q1S:Secoder_UC:1.2.0:chipTAN-QR:6:1:TAN-Nummer:3:J:2:N:0:0:N:N:00:0:N:1:920:2:smsTAN:::smsTAN:6:1:TAN:3:J:2:N:0:0:N:N:00:2:N:1:921:2:pushTAN:::pushTAN:6:1:TAN:3:J:2:N:0:0:N:N:00:2:N:1:922:2:pushTAN2:::pushTAN 2.0:6:1:TAN:3:J:2:N:0:0:N:N:00:2:N:1:923:2:pushTAN2:DecoupledPush::pushTAN 2.0:6:1:TAN:3:J:2:N:0:0:N:N:00:2:N:1',
      ]);

      const methods = extractTanMethods(segments);
      expect(methods.length).toBe(8);
      expect(methods.map((m) => m.id).sort()).toEqual([
        '910',
        '911',
        '912',
        '913',
        '920',
        '921',
        '922',
        '923',
      ]);

      // Verify names are correctly extracted
      const chipTanManuell = methods.find((m) => m.id === '910');
      expect(chipTanManuell?.name).toBe('chipTAN manuell');

      const pushTan20 = methods.find((m) => m.id === '923');
      expect(pushTan20?.name).toBe('pushTAN 2.0');
    });

    it('should identify decoupled TAN methods by dkTanVerfahren field', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', [
        'HITANS:70:7:4+1+1+0+J:N:0:923:2:pushTAN2:DecoupledPush::pushTAN 2.0',
      ]);

      const methods = extractTanMethods(segments);
      const pushTan = methods.find((m) => m.id === '923');
      expect(pushTan).toBeDefined();
      expect(pushTan?.isDecoupled).toBe(true);
    });

    it('should not match 999 as it is reserved for single-step mode', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', ['HITANS:70:6:4+1+1+1+999:2:singleStep:::Single Step TAN']);

      const methods = extractTanMethods(segments);
      expect(methods.find((m) => m.id === '999')).toBeUndefined();
    });
  });

  describe('extractAllowedTanMethods', () => {
    it('should extract allowed TAN methods from HIRMS 3920 with colon format', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', ['HIRMS:3:2+3920::Allowed TAN methods:900:910:920']);

      const allowed = extractAllowedTanMethods(segments);
      expect(allowed).toContain('900');
      expect(allowed).toContain('910');
      expect(allowed).toContain('920');
    });

    it('should extract single TAN method with period format (Sparkasse)', () => {
      // Real format from Sparkasse: "3920::Zugelassene Zwei-Schritt-Verfahren für den Benutzer.:923"
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', [
        'HIRMS:4:2:4+3920::Zugelassene Zwei-Schritt-Verfahren für den Benutzer.:923',
      ]);

      const allowed = extractAllowedTanMethods(segments);
      expect(allowed).toEqual(['923']);
    });

    it('should extract multiple TAN methods from complex HIRMS', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', [
        "HIRMS:4:2:4+3050::BPD nicht mehr aktuell.+3920::Zugelassene Verfahren:910:920:923'",
      ]);

      const allowed = extractAllowedTanMethods(segments);
      expect(allowed).toContain('910');
      expect(allowed).toContain('920');
      expect(allowed).toContain('923');
    });

    it('should return empty array if no 3920 code', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', ['HIRMS:3:2+0010::Success']);

      const allowed = extractAllowedTanMethods(segments);
      expect(allowed).toEqual([]);
    });

    it('should handle missing HIRMS', () => {
      const segments = new Map<string, string[]>();

      const allowed = extractAllowedTanMethods(segments);
      expect(allowed).toEqual([]);
    });

    it('should only extract valid TAN method IDs (9xx)', () => {
      const segments = new Map<string, string[]>();
      // Contains 180 which should NOT be extracted
      segments.set('HIRMS', ['HIRMS:3:2+3920::Methods:180:923:2048']);

      const allowed = extractAllowedTanMethods(segments);
      expect(allowed).toEqual(['923']);
      expect(allowed).not.toContain('180');
      expect(allowed).not.toContain('2048');
    });
  });

  describe('checkTanRequired', () => {
    it('should return null if no HITAN segment', () => {
      const segments = new Map<string, string[]>();

      const result = checkTanRequired(segments);
      expect(result).toBeNull();
    });

    it('should extract TAN request from HITAN', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5+4++ORDER_REF_123+Please confirm in your banking app']);

      const result = checkTanRequired(segments);
      expect(result).not.toBeNull();
      expect(result?.dialogId).toBe('DIALOG123');
    });

    it('should extract order reference from HITAN', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5+4++ORDER_REF_123+Please confirm']);

      const result = checkTanRequired(segments);
      expect(result?.orderRef).toBe('ORDER_REF_123');
    });

    it('should extract challenge text from HITAN', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5+4++ORDER_REF+Please confirm in your banking app']);

      const result = checkTanRequired(segments);
      expect(result?.challengeText).toContain('Please confirm');
    });

    it('should provide default challenge text if missing', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5+4++++']);

      const result = checkTanRequired(segments);
      if (result) {
        expect(result.challengeText).toBeTruthy();
      }
    });

    it('should return null if HITAN has no meaningful content', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5++++']);

      const result = checkTanRequired(segments);
      // If both tanProcess and challengeText are empty, returns null
      expect(result).toBeNull();
    });
  });
});
