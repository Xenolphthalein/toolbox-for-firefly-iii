/**
 * FinTS Client for read-only operations
 *
 * This is the main client class that orchestrates all FinTS operations
 * including dialog management, TAN handling, and transaction fetching.
 */

import type {
  FinTSConfig,
  FinTSAccount,
  FinTSTransaction,
  FinTSFetchOptions,
  FinTSDialogState,
  FinTSTanMethod,
} from '../../../shared/types/app.js';

import { PRODUCT_ID } from './constants.js';
import { logger, logMessage, generateMsgRef } from './utils.js';
import {
  buildHNSHK,
  buildHKIDN,
  buildHKVVB,
  buildHKEND,
  buildHNSHA,
  buildHKSPA,
  buildHKTAN,
  buildHKKAZ,
} from './segments.js';
import { wrapMessage, wrapAuthenticatedMessage } from './message.js';
import { parseSegments, extractElements } from './parsers.js';
import { parseMT940 } from './mt940.js';
import {
  checkForErrors,
  checkForCriticalWarnings,
  extractDialogId,
  extractAccounts,
  extractTanMethods,
  extractAllowedTanMethods,
  checkTanRequired,
} from './extractors.js';
import { sendRequest } from './transport.js';

/**
 * Custom error class for FinTS authentication issues
 */
export class FinTSAuthError extends Error {
  constructor(
    message: string,
    public code: number
  ) {
    super(message);
    this.name = 'FinTSAuthError';
  }
}

/**
 * FinTS Client for read-only operations
 */
export class FinTSClient {
  private config: FinTSConfig;
  private dialogId: string = '0';
  private msgNumber: number = 1;
  private systemId: string = '0';
  private secRef: string;
  private tanMethods: FinTSTanMethod[] = [];
  private allowedTanMethods: string[] = [];
  private selectedTanMethod: string = '999'; // Default to single-step
  private orderRef: string = '';

  constructor(config: FinTSConfig) {
    this.config = config;
    this.secRef = generateMsgRef();
    logger.info(`Client created for bank ${config.bankCode}`);
    logger.debug(`FinTS URL: ${config.url}`);
  }

  /**
   * Initialize dialog and get available accounts
   */
  async initDialog(): Promise<FinTSDialogState> {
    logger.info('Initializing dialog...');
    this.dialogId = '0';
    this.msgNumber = 1;
    this.secRef = generateMsgRef();

    // Step 1: Dialog initialization (only HKIDN + HKVVB) with single-step mode first
    // to discover available TAN methods
    const initSegments = [
      buildHNSHK(2, this.secRef, this.config.bankCode, this.config.userId, this.systemId, '999'),
      buildHKIDN(3, this.config.bankCode, this.config.userId, this.systemId),
      buildHKVVB(4, 0, 0, this.config.productId || PRODUCT_ID),
      buildHNSHA(5, this.secRef, this.config.pin),
    ];

    logger.debug(`Built ${initSegments.length} signed segments for init dialog`);

    // Wrap with HNVSK/HNVSD encryption envelope
    const initMessage = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      initSegments
    );

    logMessage('debug', 'Init message to send', initMessage);

    const initResponse = await sendRequest(this.config.url, initMessage);

    logMessage('debug', 'Init response', initResponse);

    const initParsedSegments = parseSegments(initResponse);

    logger.debug(`Parsed ${initParsedSegments.size} segment types from init response`);

    // Check for hard errors first (9xxx codes)
    try {
      checkForErrors(initParsedSegments);
    } catch (error) {
      // Convert auth error marker to proper FinTSAuthError
      if (error instanceof Error && error.name === 'FinTSAuthError') {
        const match = error.message.match(/^AUTH_ERROR:(\d+):(.*)$/);
        if (match) {
          const code = parseInt(match[1], 10);
          const message = match[2];
          logger.error(`Authentication error: ${code} - ${message}`);
          // Try to end dialog gracefully
          try {
            this.dialogId = extractDialogId(initParsedSegments);
            await this.endDialog();
          } catch {
            // Ignore errors ending dialog after auth failure
          }
          throw new FinTSAuthError(message, code);
        }
      }
      throw error;
    }

    // Check for critical warnings (account locked, PIN wrong, etc.)
    const criticalWarning = checkForCriticalWarnings(initParsedSegments);
    if (criticalWarning) {
      logger.error(`Critical warning: ${criticalWarning.code} - ${criticalWarning.message}`);
      // End dialog gracefully before throwing
      this.dialogId = extractDialogId(initParsedSegments);
      await this.endDialog();
      throw new FinTSAuthError(criticalWarning.message, criticalWarning.code);
    }

    this.dialogId = extractDialogId(initParsedSegments);
    this.msgNumber++;

    logger.debug(`Dialog ID: ${this.dialogId}`);

    // Extract available TAN methods from BPD
    this.tanMethods = extractTanMethods(initParsedSegments);
    this.allowedTanMethods = extractAllowedTanMethods(initParsedSegments);

    logger.info(
      `Available TAN methods: ${this.tanMethods.map((m) => `${m.id}:${m.name}`).join(', ')}`
    );
    logger.info(`Allowed TAN methods for user: ${this.allowedTanMethods.join(', ')}`);

    // Validate that we have allowed TAN methods
    if (this.allowedTanMethods.length === 0) {
      logger.error('No allowed TAN methods for user - authentication may have failed');
      await this.endDialog();
      throw new FinTSAuthError(
        'No TAN methods available. Please check your credentials and try again.',
        3920
      );
    }

    // Select the first allowed TAN method
    this.selectedTanMethod = this.allowedTanMethods[0];
    logger.info(`Selected TAN method: ${this.selectedTanMethod}`);

    // If only two-step methods are allowed, we need to start a new dialog with TAN
    if (!this.allowedTanMethods.includes('999')) {
      // End current dialog
      await this.endDialog();

      // Start new dialog with selected TAN method
      return this.initDialogWithTan();
    }

    // Single-step worked, try to get accounts
    return this.requestAccounts(initParsedSegments);
  }

  /**
   * Initialize dialog with two-step TAN authentication
   */
  private async initDialogWithTan(): Promise<FinTSDialogState> {
    logger.info(`Starting dialog with TAN method ${this.selectedTanMethod}...`);
    this.dialogId = '0';
    this.msgNumber = 1;
    this.secRef = generateMsgRef();

    const selectedMethod = this.tanMethods.find((m) => m.id === this.selectedTanMethod);
    const isDecoupled = selectedMethod?.isDecoupled || false;

    logger.info(`TAN method ${this.selectedTanMethod} is ${isDecoupled ? 'decoupled' : 'manual'}`);

    // Use HKTAN version 7 for decoupled TAN methods (required for process S polling)
    // The bank requires consistent HKTAN versions throughout the dialog
    const hktanVersion = isDecoupled ? 7 : 6;

    // Build init segments with the selected TAN method
    const initSegments = [
      buildHNSHK(
        2,
        this.secRef,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        this.selectedTanMethod
      ),
      buildHKIDN(3, this.config.bankCode, this.config.userId, this.systemId),
      buildHKVVB(4, 0, 0, this.config.productId || PRODUCT_ID),
      buildHKTAN(5, hktanVersion, '4', 'HKIDN'), // Initiate TAN process for HKIDN
      buildHNSHA(6, this.secRef, this.config.pin),
    ];

    const initMessage = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      initSegments
    );

    logMessage('debug', 'TAN init message', initMessage);

    const initResponse = await sendRequest(this.config.url, initMessage);
    logMessage('debug', 'TAN init response', initResponse);

    const parsedSegments = parseSegments(initResponse);
    this.msgNumber++;

    // Don't check for errors yet - 0030 (TAN required) is expected
    this.dialogId = extractDialogId(parsedSegments);

    // Extract HITAN response for challenge/order reference
    const hitan = parsedSegments.get('HITAN')?.[0];
    if (hitan) {
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
      this.orderRef = elements[3] || elements[2] || elements[1] || '';
      const challengeText = elements[4] || '';

      logger.info(`Order reference: ${this.orderRef}`);
      logger.info(`Challenge: ${challengeText}`);

      return {
        dialogId: this.dialogId,
        tanRequired: true,
        tanMethods: this.tanMethods,
        selectedTanMethod: this.selectedTanMethod,
        tanRequest: {
          tanProcess: isDecoupled ? 'decoupled' : 'twoStep',
          tanMethodId: this.selectedTanMethod,
          challengeText: challengeText || 'Please confirm in your banking app',
          dialogId: this.dialogId,
          orderRef: this.orderRef,
        },
        accounts: [],
        statusMessage: isDecoupled
          ? 'Please confirm the login in your banking app'
          : 'Please enter the TAN',
      };
    }

    // Check for actual errors
    checkForErrors(parsedSegments);

    // If we got here, TAN was somehow not required
    return this.requestAccounts(parsedSegments);
  }

  /**
   * Request SEPA accounts after successful authentication
   */
  private async requestAccounts(parsedSegments: Map<string, string[]>): Promise<FinTSDialogState> {
    // Check if TAN is required for the dialog
    const tanRequest = checkTanRequired(parsedSegments);

    if (tanRequest) {
      logger.info('TAN required for authentication');
      return {
        dialogId: this.dialogId,
        tanRequired: true,
        tanRequest: tanRequest,
        accounts: [],
        statusMessage: 'TAN required for authentication',
      };
    }

    // Step 2: Request SEPA accounts (HKSPA) in a separate message
    logger.info('Requesting SEPA accounts...');
    this.secRef = generateMsgRef();

    const accountSegments = [
      buildHNSHK(2, this.secRef, this.config.bankCode, this.config.userId, this.systemId),
      buildHKSPA(3),
      buildHNSHA(4, this.secRef, this.config.pin),
    ];

    const accountMessage = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      accountSegments
    );

    logMessage('debug', 'Account request message', accountMessage);

    const accountResponse = await sendRequest(this.config.url, accountMessage);

    logMessage('debug', 'Account response', accountResponse);

    const accountParsedSegments = parseSegments(accountResponse);
    this.msgNumber++;

    checkForErrors(accountParsedSegments);

    const accounts = extractAccounts(accountParsedSegments);

    logger.info(`Dialog initialized. Found ${accounts.length} account(s).`);

    return {
      dialogId: this.dialogId,
      tanRequired: false,
      accounts,
      statusMessage: `Dialog initialized. Found ${accounts.length} account(s).`,
    };
  }

  /**
   * Poll for decoupled TAN completion (for app-based TAN like DKB App)
   */
  async pollDecoupledTan(orderRef: string): Promise<FinTSDialogState> {
    logger.info(`Polling for decoupled TAN completion (orderRef: ${orderRef})...`);
    this.orderRef = orderRef;
    this.secRef = generateMsgRef();

    const segments = [
      buildHNSHK(
        2,
        this.secRef,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        this.selectedTanMethod
      ),
      buildHKTAN(3, 7, 'S', undefined, orderRef), // Poll status (v7 required for process S)
      buildHNSHA(4, this.secRef, this.config.pin),
    ];

    const message = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      segments
    );

    logMessage('debug', 'Poll message', message);

    const response = await sendRequest(this.config.url, message);
    logMessage('debug', 'Poll response', response);

    const parsedSegments = parseSegments(response);
    this.msgNumber++;

    // Check for response code 0900 "TAN gültig" - authentication complete!
    // The bank may include this along with HIUPD (account data) in the same response
    const hirms = parsedSegments.get('HIRMS')?.[0];
    if (hirms && hirms.includes('0900')) {
      logger.info('TAN verified successfully (0900::TAN gültig)');

      // Parse accounts from HIUPD segments in this response
      const hiupdSegments = parsedSegments.get('HIUPD');
      logger.debug(`Found ${hiupdSegments?.length || 0} HIUPD segments in response`);

      const accounts = this.parseAccountsFromResponse(parsedSegments);
      logger.debug(`Parsed ${accounts.length} accounts from response`);

      if (accounts.length > 0) {
        logger.info(`Found ${accounts.length} account(s) in TAN verification response`);
        return {
          dialogId: this.dialogId,
          tanRequired: false,
          accounts,
          statusMessage: `Authentication complete. Found ${accounts.length} account(s).`,
        };
      }

      // If no accounts in response, request them separately
      return this.requestAccountsAfterTan();
    }

    // Check for HITAN response
    const hitan = parsedSegments.get('HITAN')?.[0];
    if (hitan) {
      const elements = extractElements(hitan);
      // HITAN elements: [0]=":segRef", [1]=tanProcess, [2]=empty, [3]=orderRef, [4]=challenge
      const tanProcess = elements[1] || '';

      logger.debug(`Poll HITAN tanProcess: ${tanProcess}`);

      // tanProcess 'S' means still waiting for decoupled confirmation
      if (tanProcess === 'S') {
        logger.info('Still waiting for TAN confirmation in app...');
        return {
          dialogId: this.dialogId,
          tanRequired: true,
          tanRequest: {
            tanProcess: 'decoupled',
            tanMethodId: this.selectedTanMethod,
            challengeText: elements[4] || 'Waiting for confirmation in your banking app...',
            dialogId: this.dialogId,
            orderRef: this.orderRef,
          },
          accounts: [],
          statusMessage: 'Waiting for confirmation in your banking app...',
        };
      }
    }

    // Check for response code 3956 "Starke Kundenauthentifizierung noch ausstehend" (authentication still pending)
    if (hirms && hirms.includes('3956')) {
      logger.info('Authentication still pending (3956), continuing to poll...');
      return {
        dialogId: this.dialogId,
        tanRequired: true,
        tanRequest: {
          tanProcess: 'decoupled',
          tanMethodId: this.selectedTanMethod,
          challengeText: 'Waiting for confirmation in your banking app...',
          dialogId: this.dialogId,
          orderRef: this.orderRef,
        },
        accounts: [],
        statusMessage: 'Waiting for confirmation in your banking app...',
      };
    }

    // Check for errors (but 0030 "TAN required" might still be present)
    try {
      checkForErrors(parsedSegments);
    } catch (error) {
      // Check if it's just "TAN required" which is expected during polling
      if (
        error instanceof Error &&
        (error.message.includes('3920') || error.message.includes('0030'))
      ) {
        logger.debug('TAN still required, continuing to poll...');
        return {
          dialogId: this.dialogId,
          tanRequired: true,
          tanRequest: {
            tanProcess: 'decoupled',
            tanMethodId: this.selectedTanMethod,
            challengeText: 'Waiting for confirmation in your banking app...',
            dialogId: this.dialogId,
            orderRef: this.orderRef,
          },
          accounts: [],
          statusMessage: 'Waiting for confirmation in your banking app...',
        };
      }
      throw error;
    }

    // TAN process completed, now get accounts
    logger.info('Decoupled TAN verified successfully');
    return this.requestAccountsAfterTan();
  }

  /**
   * Submit TAN for two-step authentication (manual TAN entry)
   */
  async submitTan(tan: string, orderRef: string): Promise<FinTSDialogState> {
    logger.info(`Submitting TAN (orderRef: ${orderRef})...`);
    this.orderRef = orderRef;
    this.secRef = generateMsgRef();

    const segments = [
      buildHNSHK(
        2,
        this.secRef,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        this.selectedTanMethod
      ),
      buildHKTAN(3, 6, '2', undefined, orderRef), // Submit TAN
      buildHNSHA(4, this.secRef, this.config.pin, tan),
    ];

    const message = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      segments
    );

    logMessage('debug', 'TAN submit message', message);

    const response = await sendRequest(this.config.url, message);
    logMessage('debug', 'TAN submit response', response);

    const parsedSegments = parseSegments(response);
    this.msgNumber++;

    checkForErrors(parsedSegments);

    logger.info('TAN verified successfully');
    return this.requestAccountsAfterTan();
  }

  /**
   * Request accounts after successful TAN authentication
   */
  private async requestAccountsAfterTan(): Promise<FinTSDialogState> {
    logger.info('Requesting SEPA accounts after TAN...');
    this.secRef = generateMsgRef();

    // Use HKTAN version 7 for decoupled TAN methods (must be consistent throughout dialog)
    const selectedMethod = this.tanMethods.find((m) => m.id === this.selectedTanMethod);
    const isDecoupled = selectedMethod?.isDecoupled || false;
    const hktanVersion = isDecoupled ? 7 : 6;

    const accountSegments = [
      buildHNSHK(
        2,
        this.secRef,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        this.selectedTanMethod
      ),
      buildHKSPA(3),
      buildHKTAN(4, hktanVersion, '4', 'HKSPA'), // Initiate TAN for HKSPA
      buildHNSHA(5, this.secRef, this.config.pin),
    ];

    const accountMessage = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      accountSegments
    );

    logMessage('debug', 'Account request message', accountMessage);

    const accountResponse = await sendRequest(this.config.url, accountMessage);
    logMessage('debug', 'Account response', accountResponse);

    const accountParsedSegments = parseSegments(accountResponse);
    this.msgNumber++;
    logger.debug(`After account request, message number is now: ${this.msgNumber}`);

    // Check if another TAN is needed for HKSPA
    const hitan = accountParsedSegments.get('HITAN')?.[0];
    if (hitan) {
      const elements = extractElements(hitan);
      // HITAN elements: [0]=":segRef", [1]=tanProcess, [2]=empty, [3]=orderRef, [4]=challenge
      // Check for "noref" which means no TAN required
      const orderRef = elements[3] || '';
      const challenge = elements[4] || '';

      logger.debug(`HITAN in account response: orderRef=${orderRef}, challenge=${challenge}`);

      // "noref" or "nochallenge" means no TAN is actually required
      if (orderRef === 'noref' || challenge === 'nochallenge') {
        logger.info('No TAN required for account access (noref/nochallenge)');
        // Fall through to account extraction below
      } else if (orderRef && orderRef !== 'noref') {
        // Real TAN required
        this.orderRef = orderRef;
        const challengeText = challenge.length > 5 ? challenge : 'Please confirm account access';

        const selectedMethod = this.tanMethods.find((m) => m.id === this.selectedTanMethod);
        const isDecoupled = selectedMethod?.isDecoupled || false;

        logger.info('TAN required for account access');

        return {
          dialogId: this.dialogId,
          tanRequired: true,
          tanRequest: {
            tanProcess: isDecoupled ? 'decoupled' : 'twoStep',
            tanMethodId: this.selectedTanMethod,
            challengeText,
            dialogId: this.dialogId,
            orderRef: this.orderRef,
          },
          accounts: [],
          statusMessage: 'TAN required for account access',
        };
      }
    }

    try {
      checkForErrors(accountParsedSegments);
    } catch (error) {
      // 9040 means authentication missing - might need different approach
      logger.error(`Account request failed: ${error}`);
      throw error;
    }

    const accounts = extractAccounts(accountParsedSegments);

    logger.info(`Found ${accounts.length} account(s)`);

    return {
      dialogId: this.dialogId,
      tanRequired: false,
      tanMethods: this.tanMethods,
      selectedTanMethod: this.selectedTanMethod,
      accounts,
      statusMessage: `Found ${accounts.length} account(s).`,
    };
  }

  /**
   * Parse accounts from a response containing HIUPD segments
   */
  private parseAccountsFromResponse(segments: Map<string, string[]>): FinTSAccount[] {
    return extractAccounts(segments);
  }

  /**
   * Fetch transactions for an account
   */
  async fetchTransactions(options: FinTSFetchOptions): Promise<FinTSTransaction[]> {
    logger.info(
      `Fetching transactions for account ${options.account.iban || options.account.accountNumber}`
    );
    logger.debug(`Date range: ${options.startDate} to ${options.endDate}`);
    logger.debug(`Dialog ID: ${this.dialogId}, Message number: ${this.msgNumber}`);

    // Use HKTAN version 7 for decoupled TAN methods (must be consistent throughout dialog)
    const selectedMethod = this.tanMethods.find((m) => m.id === this.selectedTanMethod);
    const isDecoupled = selectedMethod?.isDecoupled || false;
    const hktanVersion = isDecoupled ? 7 : 6;

    const allTransactions: FinTSTransaction[] = [];
    let touchDown: string | undefined;
    let pageCount = 0;

    do {
      pageCount++;
      logger.debug(`Fetching page ${pageCount}${touchDown ? ' (continuation)' : ''}`);

      this.secRef = generateMsgRef();

      const segments = [
        buildHNSHK(
          2,
          this.secRef,
          this.config.bankCode,
          this.config.userId,
          this.systemId,
          this.selectedTanMethod
        ),
        buildHKKAZ(
          3,
          7, // Version 7 for SEPA
          options.account,
          options.startDate,
          options.endDate,
          touchDown
        ),
        buildHKTAN(4, hktanVersion, '4', 'HKKAZ'), // HKKAZ requires TAN authentication
        buildHNSHA(5, this.secRef, this.config.pin),
      ];

      const message = wrapAuthenticatedMessage(
        this.dialogId,
        this.msgNumber,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        segments
      );

      logMessage('debug', 'Transaction fetch message', message);

      const response = await sendRequest(this.config.url, message);
      logMessage('debug', 'Transaction fetch response', response);

      const parsedSegments = parseSegments(response);

      checkForErrors(parsedSegments);
      this.msgNumber++;

      // Extract MT940 data from HIKAZ
      // HIKAZ format: HIKAZ:seg:ver:ref+@LENGTH@<mt940data>'
      // We need to extract binary data directly, NOT use extractElements
      // because MT940 contains + characters that would be incorrectly split
      const hikaz = parsedSegments.get('HIKAZ')?.[0];
      if (hikaz) {
        // Find the binary data marker @LENGTH@ and extract the data
        const binaryMatch = hikaz.match(/@(\d+)@([\s\S]*)/);
        if (binaryMatch) {
          const declaredLength = parseInt(binaryMatch[1], 10);
          let mt940Data = binaryMatch[2];

          // Trim to declared length if needed (there might be trailing segment data)
          if (mt940Data.length > declaredLength) {
            mt940Data = mt940Data.slice(0, declaredLength);
          }

          logger.debug(
            `MT940 binary data: declared=${declaredLength}, actual=${mt940Data.length} chars`
          );
          const transactions = parseMT940(mt940Data);
          logger.debug(`Parsed ${transactions.length} transactions from MT940 data`);
          allTransactions.push(...transactions);
        } else {
          logger.warn('HIKAZ segment found but no binary MT940 data marker');
        }
      }

      // Check for continuation (touch-down)
      const hirms = parsedSegments.get('HIRMS') || [];
      touchDown = undefined;
      for (const segment of hirms) {
        if (segment.includes('3040')) {
          // More data available
          const tdMatch = segment.match(/3040[^+]*\+([^+]+)/);
          touchDown = tdMatch?.[1];
          if (touchDown) {
            logger.debug('More data available, continuing...');
          }
        }
      }
    } while (touchDown);

    logger.info(`Fetched ${allTransactions.length} transactions in ${pageCount} page(s)`);
    return allTransactions;
  }

  /**
   * End the dialog
   */
  async endDialog(): Promise<void> {
    if (this.dialogId === '0') {
      logger.debug('No active dialog to end');
      return;
    }

    logger.info('Ending dialog...');

    try {
      const segments = [
        buildHNSHK(2, this.secRef, this.config.bankCode, this.config.userId, this.systemId),
        buildHKEND(3, this.dialogId),
        buildHNSHA(4, this.secRef, this.config.pin),
      ];

      const message = wrapMessage(this.dialogId, this.msgNumber, segments);
      await sendRequest(this.config.url, message);
      logger.info('Dialog ended successfully');
    } catch (error) {
      logger.warn(`Error ending dialog: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      this.dialogId = '0';
      this.msgNumber = 1;
    }
  }
}
