import { describe, it, expect } from 'vitest';
import {
  buildSegment,
  buildHNHBK,
  buildHNHBS,
  buildHKIDN,
  buildHKVVB,
  buildHKEND,
  buildHKSYN,
  buildHNSHA,
  buildHNSHK,
  buildHKSPA,
  buildHKTAN,
  buildHKKAZ,
  buildHNVSK,
  buildHNVSD,
} from './segments.js';
import type { FinTSAccount } from '../../../shared/types/app.js';

describe('FinTS segments', () => {
  describe('buildSegment', () => {
    it('should build a basic segment', () => {
      const result = buildSegment('TEST', 1, 2, ['data1', 'data2']);
      expect(result).toBe("TEST:1:2+data1+data2'");
    });

    it('should handle null values as empty strings', () => {
      const result = buildSegment('TEST', 1, 1, ['data1', null, 'data3']);
      expect(result).toBe("TEST:1:1+data1++data3'");
    });

    it('should handle undefined values as empty strings', () => {
      const result = buildSegment('TEST', 1, 1, ['data1', undefined, 'data3']);
      expect(result).toBe("TEST:1:1+data1++data3'");
    });

    it('should convert numbers to strings', () => {
      const result = buildSegment('TEST', 1, 1, [123, 456]);
      expect(result).toBe("TEST:1:1+123+456'");
    });

    it('should handle empty data array', () => {
      const result = buildSegment('TEST', 1, 1, []);
      expect(result).toBe("TEST:1:1+'");
    });
  });

  describe('buildHNHBK', () => {
    it('should build message header', () => {
      const result = buildHNHBK('DIALOG123', 1);
      expect(result).toMatch(/^HNHBK:1:3\+000000000000\+300\+DIALOG123\+1'$/);
    });

    it('should include dialog ID', () => {
      const result = buildHNHBK('MYDIAG', 5);
      expect(result).toContain('MYDIAG');
      expect(result).toContain('+5');
    });
  });

  describe('buildHNHBS', () => {
    it('should build message footer', () => {
      const result = buildHNHBS(5, 1);
      expect(result).toBe("HNHBS:5:1+1'");
    });

    it('should use correct segment number', () => {
      const result = buildHNHBS(10, 3);
      expect(result).toBe("HNHBS:10:1+3'");
    });
  });

  describe('buildHKIDN', () => {
    it('should build identification segment', () => {
      const result = buildHKIDN(2, '12345678', 'testuser');
      expect(result).toBe("HKIDN:2:2+280:12345678+testuser+0+1'");
    });

    it('should use custom system ID', () => {
      const result = buildHKIDN(2, '12345678', 'testuser', 'SYS001');
      expect(result).toBe("HKIDN:2:2+280:12345678+testuser+SYS001+1'");
    });

    it('should encode special characters in user ID', () => {
      const result = buildHKIDN(2, '12345678', 'user+special');
      expect(result).toContain('user?+special');
    });
  });

  describe('buildHKVVB', () => {
    it('should build processing preparation segment', () => {
      const result = buildHKVVB(3);
      expect(result).toMatch(/^HKVVB:3:3\+0\+0\+0\+.*\+1\.0'$/);
    });

    it('should use custom BPD/UPD versions', () => {
      const result = buildHKVVB(3, 5, 10);
      expect(result).toContain('+5+10+');
    });

    it('should accept custom product ID', () => {
      const result = buildHKVVB(3, 0, 0, 'CUSTOM123');
      expect(result).toContain('CUSTOM123');
    });
  });

  describe('buildHKEND', () => {
    it('should build dialog end segment', () => {
      const result = buildHKEND(4, 'DIALOG123');
      expect(result).toBe("HKEND:4:1+DIALOG123'");
    });
  });

  describe('buildHKSYN', () => {
    it('should build synchronization segment with mode 0 (new Kundensystem-ID)', () => {
      const result = buildHKSYN(5, 0);
      expect(result).toBe("HKSYN:5:3+0'");
    });

    it('should build synchronization segment with mode 1 (last message number)', () => {
      const result = buildHKSYN(5, 1);
      expect(result).toBe("HKSYN:5:3+1'");
    });

    it('should build synchronization segment with mode 2 (signature ID)', () => {
      const result = buildHKSYN(5, 2);
      expect(result).toBe("HKSYN:5:3+2'");
    });

    it('should default to mode 0', () => {
      const result = buildHKSYN(3);
      expect(result).toBe("HKSYN:3:3+0'");
    });
  });

  describe('buildHNSHA', () => {
    it('should build signature footer with PIN only', () => {
      const result = buildHNSHA(4, 'REF001', 'mypin');
      expect(result).toBe("HNSHA:4:2+REF001++mypin'");
    });

    it('should build signature footer with PIN and TAN', () => {
      const result = buildHNSHA(4, 'REF001', 'mypin', '123456');
      expect(result).toBe("HNSHA:4:2+REF001++mypin:123456'");
    });

    it('should encode special characters in PIN', () => {
      const result = buildHNSHA(4, 'REF001', 'pin+special');
      expect(result).toContain('pin?+special');
    });

    it('should encode special characters in TAN', () => {
      const result = buildHNSHA(4, 'REF001', 'mypin', 'tan+val');
      expect(result).toContain('tan?+val');
    });
  });

  describe('buildHNSHK', () => {
    it('should build signature header', () => {
      const result = buildHNSHK(2, 'REF001', '12345678', 'testuser', 'SYS001');
      expect(result).toMatch(/^HNSHK:2:4\+PIN:1\+/);
    });

    it('should include bank code and user ID', () => {
      const result = buildHNSHK(2, 'REF001', '12345678', 'testuser', 'SYS001');
      expect(result).toContain('280:12345678:testuser');
    });

    it('should use default TAN process 999', () => {
      const result = buildHNSHK(2, 'REF001', '12345678', 'testuser', 'SYS001');
      expect(result).toContain('+999+');
    });

    it('should use custom TAN process', () => {
      const result = buildHNSHK(2, 'REF001', '12345678', 'testuser', 'SYS001', '4');
      expect(result).toContain('+4+');
    });

    it('should include date and time', () => {
      const result = buildHNSHK(2, 'REF001', '12345678', 'testuser', 'SYS001');
      // Should contain date in format YYYYMMDD (8 digits)
      expect(result).toMatch(/\d{8}:\d{6}/);
    });
  });

  describe('buildHKSPA', () => {
    it('should build SEPA account request', () => {
      const result = buildHKSPA(5);
      expect(result).toBe("HKSPA:5:1'");
    });
  });

  describe('buildHKTAN', () => {
    it('should build TAN process 4 (init two-step)', () => {
      const result = buildHKTAN(5, 6, '4', 'HKKAZ');
      expect(result).toBe("HKTAN:5:6+4+HKKAZ'");
    });

    it('should build TAN process 2 (submit TAN)', () => {
      const result = buildHKTAN(5, 6, '2', undefined, 'ORDER123');
      expect(result).toBe("HKTAN:5:6+2++++ORDER123+N'");
    });

    it('should build TAN process S (poll decoupled)', () => {
      const result = buildHKTAN(5, 7, 'S', undefined, 'ORDER123');
      expect(result).toBe("HKTAN:5:7+S++++ORDER123+N'");
    });

    it('should handle empty segment ID for process 4', () => {
      const result = buildHKTAN(5, 6, '4');
      expect(result).toBe("HKTAN:5:6+4+'");
    });

    it('should handle empty order ref for process 2', () => {
      const result = buildHKTAN(5, 6, '2');
      expect(result).toBe("HKTAN:5:6+2+++++N'");
    });
  });

  describe('buildHKKAZ', () => {
    const mockAccount: FinTSAccount = {
      accountNumber: '1234567890',
      bankCode: '12345678',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      ownerName: 'Test User',
      accountType: 'Checking',
      currency: 'EUR',
    };

    it('should build account transactions request (v6)', () => {
      const result = buildHKKAZ(6, 6, mockAccount, '2024-01-01', '2024-01-31');
      expect(result).toMatch(/^HKKAZ:6:6\+/);
      expect(result).toContain('1234567890::280:12345678'); // National format for v6
      expect(result).toContain('+N+'); // alleKonten=N
    });

    it('should build account transactions request (v7)', () => {
      const result = buildHKKAZ(6, 7, mockAccount, '2024-01-01', '2024-01-31');
      expect(result).toMatch(/^HKKAZ:6:7\+/);
      expect(result).toContain('DE89370400440532013000:COBADEFFXXX'); // International format for v7
    });

    it('should format dates correctly', () => {
      const result = buildHKKAZ(6, 6, mockAccount, '2024-01-15', '2024-06-30');
      expect(result).toContain('+20240115+');
      expect(result).toContain('+20240630+');
    });

    it('should include touch-down point for pagination', () => {
      const result = buildHKKAZ(6, 6, mockAccount, '2024-01-01', '2024-01-31', 'TOUCH123');
      expect(result).toContain('+TOUCH123');
    });
  });

  describe('buildHNVSK', () => {
    it('should build encryption header', () => {
      const result = buildHNVSK('12345678', 'testuser', 'SYS001');
      expect(result).toMatch(/^HNVSK:998:3\+PIN:1\+998\+1\+/);
    });

    it('should include bank code and user ID', () => {
      const result = buildHNVSK('12345678', 'testuser', 'SYS001');
      expect(result).toContain('280:12345678:testuser');
    });

    it('should include system ID', () => {
      const result = buildHNVSK('12345678', 'testuser', 'MYSYS');
      expect(result).toContain('::MYSYS+');
    });

    it('should include date and time', () => {
      const result = buildHNVSK('12345678', 'testuser', 'SYS001');
      // Should contain date:time format
      expect(result).toMatch(/1:\d{8}:\d{6}\+/);
    });
  });

  describe('buildHNVSD', () => {
    it('should wrap encrypted content', () => {
      const result = buildHNVSD('encrypted_data');
      expect(result).toBe("HNVSD:999:1+@14@encrypted_data'");
    });

    it('should calculate content length correctly', () => {
      const content = 'short';
      const result = buildHNVSD(content);
      expect(result).toContain(`@${content.length}@`);
    });

    it('should handle empty content', () => {
      const result = buildHNVSD('');
      expect(result).toBe("HNVSD:999:1+@0@'");
    });
  });
});
