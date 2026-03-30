import { describe, expect, it } from 'vitest';
import { parseAqBankingBankIndex } from './fintsBankIndex.js';

describe('fintsBankIndex', () => {
  describe('parseAqBankingBankIndex', () => {
    it('extracts supported FinTS PINTAN endpoints from aqbanking bank data', () => {
      const rawData = `bankId="20000002"
bic="ZZZZDEFFXXX"
bankName="Zeta%20Bank"
city="Hamburg"
services {
  element {
    type="HBCI"
    address="https%3A%2F%2Fzeta.example%2Fhbci"
    pversion="3.0"
    mode="PINTAN"
  }
}

bankId="10000001"
bic="AAAADEFFXXX"
bankName="Alpha%20Bank"
city="Berlin"
services {
  element {
    type="HBCI"
    address="https%3A%2F%2Falpha.example%2Ffints30"
    pversion=""
    mode="PINTAN"
  }
}
`;

      expect(parseAqBankingBankIndex(rawData)).toEqual([
        {
          blz: '10000001',
          bic: 'AAAADEFFXXX',
          city: 'Berlin',
          name: 'Alpha Bank',
          url: 'https://alpha.example/fints30',
        },
        {
          blz: '20000002',
          bic: 'ZZZZDEFFXXX',
          city: 'Hamburg',
          name: 'Zeta Bank',
          url: 'https://zeta.example/hbci',
        },
      ]);
    });

    it('ignores unsupported services and keeps the first valid match for duplicate BLZ values', () => {
      const rawData = `bankId="30000003"
bic="BBBBDEFFXXX"
bankName="Beta Bank"
city="Koln"
services {
  element {
    type="HBCI"
    address="https%3A%2F%2Fbeta.example%2Fold"
    pversion="2.2"
    mode="PINTAN"
  }
  element {
    type="HBCI"
    address="https%3A%2F%2Fbeta.example%2Ffints"
    pversion=""
    mode="PINTAN"
  }
}

bankId="30000003"
bic="BBBBDEFFXXX"
bankName="Beta Bank Duplicate"
city="Koln"
services {
  element {
    type="HBCI"
    address="https%3A%2F%2Fbeta.example%2Fnew"
    pversion="3.0"
    mode="PINTAN"
  }
}

bankId="40000004"
bic="CCCCDEFFXXX"
bankName="Ignored Bank"
city="Munich"
services {
  element {
    type="HBCI"
    address="https%3A%2F%2Fignored.example%2Ffints"
    pversion="3.0"
    mode="DDV"
  }
}
`;

      expect(parseAqBankingBankIndex(rawData)).toEqual([
        {
          blz: '30000003',
          bic: 'BBBBDEFFXXX',
          city: 'Koln',
          name: 'Beta Bank',
          url: 'https://beta.example/fints',
        },
      ]);
    });
  });
});
