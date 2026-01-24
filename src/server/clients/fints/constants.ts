/**
 * FinTS constants and known bank information
 */

// FinTS message constants
export const FINTS_VERSION = '300'; // FinTS 3.0
export const PRODUCT_ID = '00000000000000000000000000'; // Anonymous product ID
export const DIALOG_LANGUAGE = '0'; // German (default)

/**
 * Known German banks with their FinTS URLs
 * This is a small subset - users can also enter custom URLs
 */
export const KNOWN_BANKS: Record<string, { name: string; url: string; blz: string }> = {
  '12030000': {
    name: 'Deutsche Kreditbank (DKB)',
    url: 'https://fints.dkb.de/fints',
    blz: '12030000',
  },
  '50010517': {
    name: 'ING-DiBa',
    url: 'https://fints.ing-diba.de/fints/',
    blz: '50010517',
  },
  '37050198': {
    name: 'Sparkasse KölnBonn',
    url: 'https://fints.sparkasse-koelnbonn.de/fints30',
    blz: '37050198',
  },
  '70150000': {
    name: 'Stadtsparkasse München',
    url: 'https://fints.sskm.de/fints30',
    blz: '70150000',
  },
  '50050201': {
    name: 'Frankfurter Sparkasse',
    url: 'https://banking-be3.s-fints-pt-be.de/fints30',
    blz: '50050201',
  },
};
