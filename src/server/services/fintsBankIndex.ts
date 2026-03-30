import { text } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import tar from 'tar-stream';
import unbzip2Stream from 'unbzip2-stream';
import type { FinTSBankInfo } from '../../shared/types/app.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('FinTS:BankIndex');

const AQBANKING_BANK_DATA_ENTRY = 'de/banks.data';

export const AQBANKING_BANK_INDEX_URL =
  'https://github.com/aqbanking/aqbanking/raw/refs/heads/master/src/libs/plugins/bankinfo/generic/de.tar.bz2';

interface ParsedBank {
  blz?: string;
  bic?: string;
  name?: string;
  city?: string;
  url?: string;
}

interface ParsedService {
  type?: string;
  address?: string;
  mode?: string;
  pversion?: string;
}

let cachedBankIndex: FinTSBankInfo[] | null = null;
let bankIndexLoadPromise: Promise<FinTSBankInfo[]> | null = null;

function getQuotedValue(line: string, field: string): string | undefined {
  const prefix = `${field}="`;
  if (!line.startsWith(prefix) || !line.endsWith('"')) {
    return undefined;
  }
  return line.slice(prefix.length, -1);
}

function decodeAqBankingValue(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function applyServiceToBank(bank: ParsedBank, service: ParsedService | null): void {
  if (!service || bank.url) {
    return;
  }

  const address = decodeAqBankingValue(service.address);
  if (!address) {
    return;
  }

  const isSupportedVersion = service.pversion === '3.0' || address.toLowerCase().includes('fints');
  if (service.type === 'HBCI' && service.mode === 'PINTAN' && isSupportedVersion) {
    bank.url = address;
  }
}

export function parseAqBankingBankIndex(rawData: string): FinTSBankInfo[] {
  const banksByBlz = new Map<string, FinTSBankInfo>();
  let currentBank: ParsedBank | null = null;
  let currentService: ParsedService | null = null;

  const finalizeService = (): void => {
    if (!currentBank || !currentService) {
      currentService = null;
      return;
    }

    applyServiceToBank(currentBank, currentService);
    currentService = null;
  };

  const finalizeBank = (): void => {
    finalizeService();

    if (
      !currentBank?.blz ||
      !currentBank.name ||
      !currentBank.url ||
      banksByBlz.has(currentBank.blz)
    ) {
      currentBank = null;
      return;
    }

    banksByBlz.set(currentBank.blz, {
      blz: currentBank.blz,
      name: currentBank.name,
      url: currentBank.url,
      bic: currentBank.bic,
      city: currentBank.city,
    });

    currentBank = null;
  };

  for (const rawLine of rawData.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line) {
      finalizeBank();
      continue;
    }

    const bankId = getQuotedValue(line, 'bankId');
    if (bankId) {
      finalizeBank();
      currentBank = { blz: bankId };
      continue;
    }

    if (!currentBank) {
      continue;
    }

    const bic = getQuotedValue(line, 'bic');
    if (bic !== undefined) {
      currentBank.bic = decodeAqBankingValue(bic);
      continue;
    }

    const bankName = getQuotedValue(line, 'bankName');
    if (bankName !== undefined) {
      currentBank.name = decodeAqBankingValue(bankName);
      continue;
    }

    const city = getQuotedValue(line, 'city');
    if (city !== undefined) {
      currentBank.city = decodeAqBankingValue(city);
      continue;
    }

    if (line === 'element {') {
      currentService = {};
      continue;
    }

    if (line === '}') {
      finalizeService();
      continue;
    }

    if (!currentService) {
      continue;
    }

    const type = getQuotedValue(line, 'type');
    if (type !== undefined) {
      currentService.type = type;
      continue;
    }

    const address = getQuotedValue(line, 'address');
    if (address !== undefined) {
      currentService.address = address;
      continue;
    }

    const mode = getQuotedValue(line, 'mode');
    if (mode !== undefined) {
      currentService.mode = mode;
      continue;
    }

    const pversion = getQuotedValue(line, 'pversion');
    if (pversion !== undefined) {
      currentService.pversion = pversion;
    }
  }

  finalizeBank();

  return Array.from(banksByBlz.values()).sort(
    (left, right) =>
      left.name.localeCompare(right.name, 'de', { sensitivity: 'base' }) ||
      left.blz.localeCompare(right.blz)
  );
}

async function extractBankDataFromArchive(archiveBuffer: Buffer): Promise<string> {
  return await new Promise((resolve, reject) => {
    const extract = tar.extract();
    const source = Readable.from([archiveBuffer]);
    const decompressor = unbzip2Stream();
    let bankData: string | null = null;
    let settled = false;

    const settleResolve = (value: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const settleReject = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    extract.on('entry', (header, stream, next) => {
      if (header.name !== AQBANKING_BANK_DATA_ENTRY) {
        stream.resume();
        stream.once('end', next);
        return;
      }

      text(stream)
        .then((content) => {
          bankData = content;
          next();
        })
        .catch(settleReject);
    });

    extract.once('finish', () => {
      if (!bankData) {
        settleReject(new Error(`Could not find ${AQBANKING_BANK_DATA_ENTRY} in aqbanking archive`));
        return;
      }

      settleResolve(bankData);
    });

    extract.once('error', settleReject);
    source.once('error', settleReject);
    decompressor.once('error', settleReject);

    source.pipe(decompressor).pipe(extract);
  });
}

async function downloadAqBankingBankData(): Promise<string> {
  const response = await fetch(AQBANKING_BANK_INDEX_URL, {
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`aqbanking bank index download failed with status ${response.status}`);
  }

  const archiveBuffer = Buffer.from(await response.arrayBuffer());
  return await extractBankDataFromArchive(archiveBuffer);
}

async function loadFinTSBankIndex(): Promise<FinTSBankInfo[]> {
  if (cachedBankIndex) {
    return cachedBankIndex;
  }

  if (bankIndexLoadPromise) {
    return await bankIndexLoadPromise;
  }

  bankIndexLoadPromise = (async () => {
    logger.info(`Downloading FinTS bank index from ${AQBANKING_BANK_INDEX_URL}`);

    const rawBankData = await downloadAqBankingBankData();
    const banks = parseAqBankingBankIndex(rawBankData);

    if (banks.length === 0) {
      throw new Error('aqbanking bank index did not contain any usable FinTS bank entries');
    }

    cachedBankIndex = banks;
    logger.info(`Loaded ${banks.length} FinTS bank entries from aqbanking`);
    return banks;
  })();

  try {
    return await bankIndexLoadPromise;
  } finally {
    bankIndexLoadPromise = null;
  }
}

export async function getFinTSBankIndex(): Promise<FinTSBankInfo[]> {
  return await loadFinTSBankIndex();
}

export async function preloadFinTSBankIndex(): Promise<void> {
  try {
    await loadFinTSBankIndex();
  } catch (error) {
    logger.warn(
      'Failed to preload FinTS bank index from aqbanking',
      error instanceof Error ? error.message : error
    );
  }
}
