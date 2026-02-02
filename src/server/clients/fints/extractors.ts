/**
 * FinTS response data extractors
 *
 * Functions for extracting specific data from parsed FinTS responses.
 */

import type { FinTSAccount, FinTSTanMethod, FinTSTanRequest } from '../../../shared/types/app.js';
import { logger } from './utils.js';
import { extractElements } from './parsers.js';

/**
 * Check response for errors
 */
export function checkForErrors(segments: Map<string, string[]>): void {
  const returnSegments = segments.get('HIRMG') || [];
  returnSegments.push(...(segments.get('HIRMS') || []));

  for (const segment of returnSegments) {
    const elements = extractElements(segment);
    for (const element of elements) {
      // Parse return code
      const codeMatch = element.match(/^(\d{4})/);
      if (codeMatch) {
        const code = parseInt(codeMatch[1], 10);
        // Codes 9xxx are errors
        if (code >= 9000) {
          throw new Error(`FinTS Error ${code}: ${element.slice(5)}`);
        }
      }
    }
  }
}

/**
 * Extract dialog ID from response
 */
export function extractDialogId(segments: Map<string, string[]>): string {
  const hnhbk = segments.get('HNHBK')?.[0];
  if (!hnhbk) {
    throw new Error('Invalid response: Missing HNHBK segment');
  }

  const elements = extractElements(hnhbk);
  return elements[2] || '0';
}

/**
 * Extract accounts from HISPA response
 */
export function extractAccounts(segments: Map<string, string[]>): FinTSAccount[] {
  const accounts: FinTSAccount[] = [];

  const hispaSegments = segments.get('HISPA') || [];
  for (const segment of hispaSegments) {
    const elements = extractElements(segment);

    // Parse account data (format varies by version)
    for (const element of elements) {
      // Look for IBAN patterns
      const ibanMatch = element.match(/([A-Z]{2}\d{2}[A-Z0-9]{4,30})/);
      const bicMatch = element.match(/([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}[A-Z0-9]{3}?)/);

      if (ibanMatch) {
        const parts = element.split(':');
        accounts.push({
          accountNumber: parts[0] || ibanMatch[1],
          ownerName: '',
          accountType: 'Account',
          currency: 'EUR',
          bankCode: parts[3] || '',
          iban: ibanMatch[1],
          bic: bicMatch?.[1],
        });
      }
    }
  }

  // Also check UPD (User Parameter Data) for accounts
  const hiupd = segments.get('HIUPD') || [];
  for (const segment of hiupd) {
    const elements = extractElements(segment);
    if (elements.length >= 3) {
      const accountInfo = elements[0].split(':');
      const existingAccount = accounts.find((a) => a.accountNumber === accountInfo[0]);

      if (!existingAccount && accountInfo[0]) {
        accounts.push({
          accountNumber: accountInfo[0],
          ownerName: elements[5] || '',
          accountType: elements[3] || 'Account',
          currency: elements[2] || 'EUR',
          bankCode: accountInfo[3] || '',
          iban: elements[1]?.match(/([A-Z]{2}\d{2}[A-Z0-9]{4,30})/)?.[1],
        });
      } else if (existingAccount) {
        existingAccount.ownerName = elements[5] || existingAccount.ownerName;
        existingAccount.accountType = elements[3] || existingAccount.accountType;
      }
    }
  }

  return accounts;
}

/**
 * Check if TAN is required and parse TAN methods
 *
 * According to FinTS spec, TAN method IDs (Sicherheitsfunktion) are in range 900-997.
 * The 999 is reserved for single-step mode.
 *
 * HITANS segment structure (v6/v7):
 * <id>:<tanProzess>:<technischeIdentifikation>:<dkTanVerfahren>:<versionDkTanVerfahren>:<name>:
 * <maxLength>:<erlaubtesFormat>:<textZurBelegung>:<maxReturnLength>:<mehrfachTan>:
 * <tanZeitDialogbezug>:<auftragsstorno>:<smsAbbuchungskonto>:<auftraggeberkontoErforderlich>:
 * <challengeKlasse>:<challengeStrukturiert>:<initialisierungsmodus>:<bezeichnungTanMediumErforderlich>:
 * <antwortHhdUc>:<anzahlUnterstuetztAktiveTanMedien>
 *
 * Example: 910:2:HHD1.3.0:::chipTAN manuell:6:1:TAN-Nummer:3:J:2:N:0:0:N:N:00:0:N:1
 */
export function extractTanMethods(segments: Map<string, string[]>): FinTSTanMethod[] {
  const methods: FinTSTanMethod[] = [];
  const hitansSegments = segments.get('HITANS') || [];

  for (const segment of hitansSegments) {
    // HITANS contains TAN method definitions embedded in colon-separated data
    // Format: HITANS:70:6:4+1+1+0+N:N:0:940:2:SealOne:Decoupled::DKB App:::DKB App:2048:...
    const elements = extractElements(segment);
    logger.debug(`HITANS elements: ${JSON.stringify(elements)}`);

    // The TAN methods are embedded within the last element(s) as colon-separated values
    for (const element of elements) {
      // Use regex to find all TAN method definitions within the element
      // TAN method IDs (Sicherheitsfunktion) are in the range 900-997 according to FinTS spec.
      // Format: <id>:<tanProzess>:<technischeIdentifikation>:<dkTanVerfahren>:<version>:<name>:...
      // The tanProzess is typically 1 or 2 (Prozessvariante).
      // Using negative lookbehind to avoid matching numbers that are part of other fields.
      const methodRegex = /(?:^|:)(9\d{2}):([12]):([^:]*):([^:]*):([^:]*):([^:]*)/g;
      let match;

      while ((match = methodRegex.exec(element)) !== null) {
        const [fullMatch, id, tanProzess, technicalName, dkTanVerfahren, version, possibleName] =
          match;

        // Skip if ID is 999 (single-step mode, not a real TAN method)
        if (id === '999') continue;

        // Determine the name - it could be in different positions
        // For DKB: 940:2:SealOne:Decoupled::DKB App - name is after empty fields
        // For chipTAN: 910:2:HHD1.3.0:::chipTAN manuell - name is after empty fields
        let name = possibleName;
        if (!name || name.length < 2) {
          // Look further in the match for a proper name
          const afterMatch = element.substring(match.index + fullMatch.length);
          const nameParts = afterMatch.split(':');
          for (const part of nameParts) {
            if (part && part.length > 2 && !/^\d+$/.test(part) && !/^[NYJ]$/.test(part)) {
              name = part;
              break;
            }
          }
        }

        // Check if this is a decoupled (app-based) TAN method
        // Decoupled methods include pushTAN 2.0, App-based TAN, etc.
        const isDecoupled =
          id === '940' || // DKB App is always method 940
          technicalName?.toLowerCase().includes('sealon') ||
          technicalName?.toLowerCase().includes('decoupled') ||
          technicalName?.toLowerCase().includes('pushtan') ||
          technicalName?.toLowerCase().includes('tan2go') ||
          dkTanVerfahren?.toLowerCase() === 'app' ||
          dkTanVerfahren?.toLowerCase() === 'decoupled' ||
          dkTanVerfahren?.toLowerCase() === 'decoupledpush' ||
          fullMatch.toLowerCase().includes('decoupled');

        // Avoid duplicates
        if (!methods.find((m) => m.id === id)) {
          logger.debug(
            `Parsed TAN method: id=${id}, tanProzess=${tanProzess}, name=${name}, technical=${technicalName}, dkTanVerfahren=${dkTanVerfahren}, isDecoupled=${isDecoupled}`
          );

          methods.push({
            id,
            name: name || technicalName || `TAN Method ${id}`,
            technicalName: technicalName || '',
            version: version || '',
            isDecoupled,
          });
        }
      }
    }
  }

  return methods;
}

/**
 * Extract allowed TAN methods for the user from HIRMS 3920
 */
export function extractAllowedTanMethods(segments: Map<string, string[]>): string[] {
  const hirmsSegments = segments.get('HIRMS') || [];

  for (const segment of hirmsSegments) {
    // Look for 3920 return code which lists allowed TAN methods
    const match = segment.match(/3920[^']*:([0-9:]+)/);
    if (match) {
      return match[1].split(':').filter((m) => m.length > 0);
    }
  }

  return [];
}

/**
 * Check if TAN is required
 */
export function checkTanRequired(segments: Map<string, string[]>): FinTSTanRequest | null {
  const hitan = segments.get('HITAN')?.[0];
  if (!hitan) return null;

  const elements = extractElements(hitan);
  logger.debug(`HITAN elements: ${JSON.stringify(elements)}`);

  // HITAN segment structure (version 6):
  // HITAN:4:6:5+4++<orderRef>+<challengeText>+++<tanMediumName>
  // Elements after extractElements:
  // [0] = ":5" (reference to segment 5)
  // [1] = "4" (TAN process: 4=init decoupled)
  // [2] = "" (empty)
  // [3] = orderRef (e.g., "DKB_161NtvIjQs-jV6dApRjFg_6AGp")
  // [4] = challengeText (e.g., "Bitte mit der DKB-App bestätigen.")
  // [5-6] = "" (empty)
  // [7] = tanMediumName (e.g., "DKB-App (Samsung SM-F...")

  const tanProcess = elements[1] || '';
  const orderRef = elements[3] || elements[2] || '';
  const challengeText = elements[4] || elements[3] || '';

  logger.debug(
    `HITAN parsed: process=${tanProcess}, orderRef=${orderRef}, challenge=${challengeText}`
  );

  if (tanProcess || challengeText) {
    return {
      tanProcess: 'twoStep', // Will be overridden by isDecoupled check in initDialogWithTan
      challengeText: challengeText || 'Please confirm in your banking app',
      dialogId: extractDialogId(segments),
      orderRef,
    };
  }

  return null;
}
