import { FireflyApiClient } from '../clients/firefly.js';
import { parseAmount } from '../utils/amountParser.js';
import { createLogger } from '../utils/logger.js';
import type { FireflyTransaction } from '../../shared/types/firefly.js';
import type {
  PayPalTransaction,
  PayPalMatchResult,
  PayPalConfidenceBreakdown,
  BulkUpdateResult,
} from '../../shared/types/app.js';

const logger = createLogger('PayPalExtender');

// Tag applied to transactions processed by the PayPal Extender
export const PAYPAL_EXTENDER_TAG = 'Toolbox for FFIII: PayPal Extender';

export interface StreamEvent<T = unknown> {
  type: 'progress' | 'result' | 'error' | 'complete';
  data: T;
}

// German to English field mapping for CSV headers
const CSV_HEADER_MAP: Record<string, keyof PayPalTransaction> = {
  Datum: 'date',
  Uhrzeit: 'time',
  Zeitzone: 'timezone',
  Name: 'name',
  Typ: 'type',
  Status: 'status',
  Währung: 'currency',
  Brutto: 'gross',
  Gebühr: 'fee',
  Netto: 'net',
  'Absender E-Mail-Adresse': 'senderEmail',
  'Empfänger E-Mail-Adresse': 'recipientEmail',
  Transaktionscode: 'transactionCode',
  'Status Gegenpartei': 'counterpartyStatus',
  Lieferadresse: 'shippingAddress',
  'Adress-Status': 'addressStatus',
  Artikelbezeichnung: 'itemDescription',
  Artikelnummer: 'itemNumber',
  'Versand- und Bearbeitungsgebühr': 'shippingAndHandlingFee',
  Versicherungsbetrag: 'insuranceAmount',
  Umsatzsteuer: 'salesTax',
  'Option 1 Name': 'option1Name',
  'Option 1 Wert': 'option1Value',
  'Option 2 Name': 'option2Name',
  'Option 2 Wert': 'option2Value',
  'Auktions-Site': 'auctionSite',
  'Käufer-ID': 'buyerId',
  'Artikel-URL': 'itemUrl',
  Enddatum: 'endDate',
  'Vorgangs-Nr.': 'caseNumber',
  'Zugehöriger Transaktionscode': 'relatedTransactionCode',
  Rechnungsnummer: 'invoiceNumber',
  Zollnummer: 'customsNumber',
  Anzahl: 'quantity',
  Empfangsnummer: 'receiptNumber',
  Guthaben: 'balance',
  'Adresszeile 1': 'addressLine1',
  Adresszusatz: 'addressLine2',
  Ort: 'city',
  Bundesland: 'state',
  PLZ: 'postalCode',
  Land: 'country',
  Telefon: 'phone',
  Betreff: 'subject',
  Hinweis: 'note',
  Zahlungsquelle: 'paymentSource',
  Kartentyp: 'cardType',
  Transaktionsereigniscode: 'transactionEventCode',
  'Zahlungsverfolgungs-ID': 'paymentTrackingId',
  Bankreferenz: 'bankReference',
  'Ländercode des Käufers': 'buyerCountryCode',
  Artikeldetails: 'itemDetails',
  Gutscheine: 'coupons',
  Sonderangebote: 'specialOffers',
  Kundenkartennummer: 'customerCardNumber',
  Autorisierungsstatus: 'authorizationStatus',
  'Anspruch auf Verkäuferschutz': 'sellerProtectionEligibility',
  Ländervorwahl: 'countryDialingCode',
  'Auswirkung auf Guthaben': 'balanceImpact',
  'E-Börse des Käufers': 'buyerEWallet',
  'Anmerkung 1': 'note1',
  'Anmerkung 2': 'note2',
  Bestellnummer: 'orderNumber',
  Kundenreferenznummer: 'customerReferenceNumber',
  'Payflow-Transaktionscode (PNREF)': 'payflowTransactionCode',
  Trinkgeld: 'tip',
  Rabatt: 'discount',
  'Verkäufer-ID': 'sellerId',
  Risikofilter: 'riskFilter',
  'Transaktionsgebühr für Ratenzahlungen': 'installmentTransactionFee',
  'Zusatzgebühr für Null-Prozent-Finanzierung': 'zeroPercentFinancingFee',
  Zahlungsziel: 'paymentTerm',
  'Art des Kreditangebots': 'creditOfferType',
  'Ursprüngliche Rechnungsnummer': 'originalInvoiceNumber',
  'Unterart der Zahlungsquelle': 'paymentSourceSubtype',
  Kampagnengebühr: 'campaignFee',
  'Name der Kampagne': 'campaignName',
  Kampagnenrabatt: 'campaignDiscount',
  'Währung des Kampagnenrabatts': 'campaignDiscountCurrency',
  Ablehnungscode: 'rejectionCode',
  'Fastlane-Checkout-Transaktion': 'fastlaneCheckoutTransaction',
  Prämienpunkte: 'rewardPoints',
};

export class PayPalExtender {
  private fireflyApi: FireflyApiClient;
  private paypalTransactions: PayPalTransaction[] = [];
  private cachedFireflyTransactions: FireflyTransaction[] | null = null;
  private cachedDateRange: { startDate?: string; endDate?: string } | null = null;

  constructor(fireflyApi: FireflyApiClient) {
    this.fireflyApi = fireflyApi;
  }

  /**
   * Set cached PayPal transactions (pre-filtered from count-transactions)
   */
  setCachedTransactions(
    transactions: FireflyTransaction[],
    startDate?: string,
    endDate?: string
  ): void {
    this.cachedFireflyTransactions = transactions;
    this.cachedDateRange = { startDate, endDate };
  }

  /**
   * Clear cached transactions
   */
  clearCachedTransactions(): void {
    this.cachedFireflyTransactions = null;
    this.cachedDateRange = null;
  }

  /**
   * Load PayPal transactions from parsed data
   */
  loadTransactions(transactions: PayPalTransaction[]): void {
    this.paypalTransactions = transactions;
  }

  /**
   * Parse PayPal CSV export
   */
  parseCSVExport(csvContent: string): PayPalTransaction[] {
    const lines = this.parseCSVLines(csvContent);
    if (lines.length < 2) {
      throw new Error('Invalid PayPal CSV: no data rows found');
    }

    logger.debug(`Parsed ${lines.length} lines from CSV`);

    const headers = lines[0];
    const mappedHeaders = headers.map((h) => CSV_HEADER_MAP[h.trim()] || h.trim());

    const transactions: PayPalTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i];
      if (values.length !== headers.length) continue;

      const transaction = this.createEmptyTransaction() as unknown as Record<string, unknown>;

      for (let j = 0; j < mappedHeaders.length; j++) {
        const key = mappedHeaders[j] as keyof PayPalTransaction;
        const value = values[j]?.trim() || '';

        // Parse numeric fields
        if (
          [
            'gross',
            'fee',
            'net',
            'shippingAndHandlingFee',
            'insuranceAmount',
            'salesTax',
            'quantity',
            'balance',
            'tip',
            'discount',
            'installmentTransactionFee',
            'zeroPercentFinancingFee',
            'campaignFee',
            'campaignDiscount',
          ].includes(key)
        ) {
          transaction[key] = parseAmount(value);
        } else {
          transaction[key] = value;
        }
      }

      const typedTransaction = transaction as unknown as PayPalTransaction;

      // Only include completed transactions with actual amounts
      if (typedTransaction.status === 'Abgeschlossen' && typedTransaction.gross !== 0) {
        transactions.push(typedTransaction);
      }
    }

    return transactions;
  }

  /**
   * Parse CSV lines handling quoted fields
   */
  private parseCSVLines(csvContent: string): string[][] {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < csvContent.length; i++) {
      const char = csvContent[i];
      const nextChar = csvContent[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentLine.push(currentField);
        currentField = '';
      } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
        currentLine.push(currentField);
        if (currentLine.some((f) => f.trim())) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
        if (char === '\r') i++; // Skip \n in \r\n
      } else if (char !== '\r') {
        currentField += char;
      }
    }

    // Handle last line
    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField);
      if (currentLine.some((f) => f.trim())) {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  /**
   * Create an empty PayPal transaction with default values
   */
  private createEmptyTransaction(): PayPalTransaction {
    return {
      date: '',
      time: '',
      timezone: '',
      name: '',
      type: '',
      status: '',
      currency: '',
      gross: 0,
      fee: 0,
      net: 0,
      senderEmail: '',
      recipientEmail: '',
      transactionCode: '',
      counterpartyStatus: '',
      relatedTransactionCode: '',
      invoiceNumber: '',
      receiptNumber: '',
      shippingAddress: '',
      addressStatus: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
      phone: '',
      itemDescription: '',
      itemNumber: '',
      shippingAndHandlingFee: 0,
      insuranceAmount: 0,
      salesTax: 0,
      quantity: 0,
      itemUrl: '',
      itemDetails: '',
      option1Name: '',
      option1Value: '',
      option2Name: '',
      option2Value: '',
      auctionSite: '',
      buyerId: '',
      endDate: '',
      caseNumber: '',
      customsNumber: '',
      orderNumber: '',
      customerReferenceNumber: '',
      payflowTransactionCode: '',
      originalInvoiceNumber: '',
      balance: 0,
      balanceImpact: '',
      subject: '',
      note: '',
      note1: '',
      note2: '',
      paymentSource: '',
      paymentSourceSubtype: '',
      cardType: '',
      transactionEventCode: '',
      paymentTrackingId: '',
      bankReference: '',
      buyerCountryCode: '',
      countryDialingCode: '',
      buyerEWallet: '',
      coupons: '',
      specialOffers: '',
      tip: 0,
      discount: 0,
      customerCardNumber: '',
      authorizationStatus: '',
      sellerProtectionEligibility: '',
      sellerId: '',
      riskFilter: '',
      installmentTransactionFee: 0,
      zeroPercentFinancingFee: 0,
      paymentTerm: '',
      creditOfferType: '',
      campaignFee: 0,
      campaignName: '',
      campaignDiscount: 0,
      campaignDiscountCurrency: '',
      rejectionCode: '',
      fastlaneCheckoutTransaction: '',
      rewardPoints: '',
    };
  }

  /**
   * Find PayPal transactions in Firefly
   */
  async findPayPalTransactions(
    startDate?: string,
    endDate?: string
  ): Promise<FireflyTransaction[]> {
    logger.debug('Finding PayPal transactions', { startDate, endDate });

    // Use cached transactions if available and date range matches
    let transactions: FireflyTransaction[];
    if (
      this.cachedFireflyTransactions &&
      this.cachedDateRange?.startDate === startDate &&
      this.cachedDateRange?.endDate === endDate
    ) {
      logger.debug(`Using ${this.cachedFireflyTransactions.length} cached Firefly transactions`);
      transactions = this.cachedFireflyTransactions;
    } else {
      logger.debug('Fetching transactions from Firefly III');
      transactions = await this.fireflyApi.getAllTransactions(startDate, endDate, 'withdrawal');
      logger.info(`Fetched ${transactions.length} total transactions`);
      // Cache for potential reuse
      this.cachedFireflyTransactions = transactions;
      this.cachedDateRange = { startDate, endDate };
    }

    // Filter for PayPal-related transactions
    const filtered = transactions.filter((t) => {
      const split = t.attributes.transactions[0];
      if (!split) return false;

      const description = split.description.toLowerCase();
      const destination = split.destination_name?.toLowerCase() || '';
      const source = split.source_name?.toLowerCase() || '';

      const paypalIndicators = ['paypal', 'pp.', 'pp *', 'paypal *'];

      return paypalIndicators.some(
        (indicator) =>
          description.includes(indicator) ||
          destination.includes(indicator) ||
          source.includes(indicator)
      );
    });

    return filtered;
  }

  /**
   * Streaming version for matching PayPal transactions
   */
  async *streamMatchTransactionsWithPayPal(
    startDate?: string,
    endDate?: string,
    excludeProcessed: boolean = true
  ): AsyncGenerator<StreamEvent> {
    if (this.paypalTransactions.length === 0) {
      logger.warn('Attempted to match without loaded PayPal transactions');
      throw new Error(
        'No PayPal transactions loaded. Please upload a PayPal activity report CSV first.'
      );
    }

    yield {
      type: 'progress',
      data: { current: 0, total: 0, message: 'Finding PayPal transactions...' },
    };

    let transactions = await this.findPayPalTransactions(startDate, endDate);

    // Filter out transactions that have already been processed
    if (excludeProcessed) {
      const initialCount = transactions.length;
      transactions = transactions.filter((t) => {
        const split = t.attributes.transactions[0];
        return !split?.tags?.includes(PAYPAL_EXTENDER_TAG);
      });
      logger.debug(
        `Filtered out ${initialCount - transactions.length} already processed transactions`
      );
    }

    const total = transactions.length;
    yield {
      type: 'progress',
      data: {
        current: 0,
        total,
        message: `Matching ${total} transactions with ${this.paypalTransactions.length} PayPal records...`,
      },
    };

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const split = transaction.attributes.transactions[0];
      if (!split) continue;

      // Emit progress every 5 transactions
      if (i % 5 === 0 || i === transactions.length - 1) {
        yield {
          type: 'progress',
          data: {
            current: i + 1,
            total,
            message: `Matching transaction ${i + 1} of ${total}...`,
          },
        };
      }

      const amount = Math.abs(parseFloat(split.amount));
      const transactionDate = new Date(split.date);

      // Try to find matching PayPal transaction
      let bestMatch: PayPalTransaction | null = null;
      let bestConfidence = 0;
      let bestBreakdown: PayPalConfidenceBreakdown | undefined = undefined;

      for (const ppTransaction of this.paypalTransactions) {
        const { confidence, breakdown } = this.calculateMatchConfidence(
          amount,
          transactionDate,
          split.description,
          ppTransaction
        );

        if (confidence > bestConfidence && confidence > 0.5) {
          bestConfidence = confidence;
          bestMatch = ppTransaction;
          bestBreakdown = breakdown;
        }
      }

      // Generate suggested description and notes
      const { description: suggestedDescription, notes: suggestedNotes } = bestMatch
        ? this.generateDescription(split.description, bestMatch)
        : { description: split.description, notes: '' };

      const result: PayPalMatchResult = {
        transactionId: transaction.id,
        transaction: split,
        matchedPayPalTransaction: bestMatch,
        matchConfidence: bestConfidence,
        confidenceBreakdown: bestBreakdown,
        suggestedDescription,
        suggestedNotes,
      };

      yield { type: 'result', data: result };
    }

    yield { type: 'complete', data: { total: transactions.length } };
  }

  /**
   * Match PayPal transactions with Firefly transactions
   */
  async matchTransactionsWithPayPal(
    startDate?: string,
    endDate?: string,
    excludeProcessed: boolean = true
  ): Promise<PayPalMatchResult[]> {
    const results: PayPalMatchResult[] = [];
    for await (const event of this.streamMatchTransactionsWithPayPal(
      startDate,
      endDate,
      excludeProcessed
    )) {
      if (event.type === 'result') {
        results.push(event.data as PayPalMatchResult);
      }
    }
    // Sort by confidence (matches first)
    return results.sort((a, b) => b.matchConfidence - a.matchConfidence);
  }

  /**
   * Calculate match confidence between Firefly and PayPal transaction
   */
  private calculateMatchConfidence(
    transactionAmount: number,
    transactionDate: Date,
    description: string,
    ppTransaction: PayPalTransaction
  ): { confidence: number; breakdown: PayPalConfidenceBreakdown } {
    const breakdown: PayPalConfidenceBreakdown = {
      transactionCodeMatch: 0,
      bankReferenceMatch: 0,
      amountMatch: 0,
      exactAmountBonus: 0,
      dateProximity: 0,
      nameMatch: 0,
    };

    // Check for transaction code in description (highest priority - 70%)
    if (ppTransaction.transactionCode) {
      const codeInDescription = description
        .toLowerCase()
        .includes(ppTransaction.transactionCode.toLowerCase());
      if (codeInDescription) {
        breakdown.transactionCodeMatch = 0.7;
      }
    }

    // Check for bank reference in description (also high priority - 70%, but doesn't stack with transaction code)
    if (ppTransaction.bankReference && breakdown.transactionCodeMatch === 0) {
      const bankRefInDescription = description
        .toLowerCase()
        .includes(ppTransaction.bankReference.toLowerCase());
      if (bankRefInDescription) {
        breakdown.bankReferenceMatch = 0.7;
      }
    }

    // Amount matching (20% if transaction code/bank ref found, otherwise 30%)
    const ppAmount = Math.abs(ppTransaction.gross);
    const amountDiff = Math.abs(transactionAmount - ppAmount);
    const amountTolerance = Math.max(transactionAmount, ppAmount) * 0.02; // 2% tolerance
    const hasIdMatch = breakdown.transactionCodeMatch > 0 || breakdown.bankReferenceMatch > 0;

    if (amountDiff <= amountTolerance) {
      breakdown.amountMatch = hasIdMatch ? 0.2 : 0.3;

      // Exact amount bonus
      if (amountDiff < 0.01) {
        breakdown.exactAmountBonus = 0.1;
      }
    }

    // Date proximity (10%)
    const ppDate = this.parsePayPalDate(ppTransaction.date);
    if (ppDate) {
      const daysDiff = Math.abs(
        (transactionDate.getTime() - ppDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff <= 7) {
        // Within a week gets full score, decreasing after
        breakdown.dateProximity = 0.1 * Math.max(0, 1 - daysDiff / 7);
      }
    }

    // Name matching in description (5%)
    if (ppTransaction.name) {
      const nameParts = ppTransaction.name.toLowerCase().split(/\s+/);
      const descLower = description.toLowerCase();
      const matchingParts = nameParts.filter((part) => part.length > 2 && descLower.includes(part));
      if (matchingParts.length > 0) {
        breakdown.nameMatch = 0.05 * (matchingParts.length / nameParts.length);
      }
    }

    const confidence = Math.min(
      breakdown.transactionCodeMatch +
        breakdown.bankReferenceMatch +
        breakdown.amountMatch +
        breakdown.exactAmountBonus +
        breakdown.dateProximity +
        breakdown.nameMatch,
      1
    );

    return { confidence, breakdown };
  }

  /**
   * Parse PayPal date string (DD.MM.YYYY format)
   */
  private parsePayPalDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Handle DD.MM.YYYY format
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }

    // Try standard parsing as fallback
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Generate description and notes for a matched transaction
   */
  private generateDescription(
    _originalDescription: string,
    ppTransaction: PayPalTransaction
  ): { description: string; notes: string } {
    const MAX_DESC_LENGTH = 50;

    // Build short description
    let shortDesc = ppTransaction.name || 'PayPal';
    if (ppTransaction.itemDescription) {
      const itemDesc =
        ppTransaction.itemDescription.length > MAX_DESC_LENGTH
          ? ppTransaction.itemDescription.substring(0, MAX_DESC_LENGTH - 3) + '...'
          : ppTransaction.itemDescription;
      shortDesc = `${ppTransaction.name}: ${itemDesc}`;
    }

    // Truncate if still too long
    if (shortDesc.length > 100) {
      shortDesc = shortDesc.substring(0, 97) + '...';
    }

    // Build detailed notes
    const noteParts: string[] = [];

    noteParts.push(`PayPal Transaction: ${ppTransaction.transactionCode}`);
    noteParts.push(`Date: ${ppTransaction.date} ${ppTransaction.time}`);
    noteParts.push(`Type: ${ppTransaction.type}`);
    noteParts.push(`Name: ${ppTransaction.name}`);

    if (ppTransaction.recipientEmail) {
      noteParts.push(`Recipient: ${ppTransaction.recipientEmail}`);
    }

    if (ppTransaction.itemDescription) {
      noteParts.push(`\nItem: ${ppTransaction.itemDescription}`);
    }

    if (ppTransaction.quantity && ppTransaction.quantity > 0) {
      noteParts.push(`Quantity: ${ppTransaction.quantity}`);
    }

    noteParts.push(`\nGross: ${ppTransaction.gross.toFixed(2)} ${ppTransaction.currency}`);
    if (ppTransaction.fee !== 0) {
      noteParts.push(`Fee: ${ppTransaction.fee.toFixed(2)} ${ppTransaction.currency}`);
    }
    noteParts.push(`Net: ${ppTransaction.net.toFixed(2)} ${ppTransaction.currency}`);

    if (ppTransaction.subject) {
      noteParts.push(`\nSubject: ${ppTransaction.subject}`);
    }

    if (ppTransaction.note) {
      noteParts.push(`Note: ${ppTransaction.note}`);
    }

    if (ppTransaction.invoiceNumber) {
      noteParts.push(`Invoice: ${ppTransaction.invoiceNumber}`);
    }

    if (ppTransaction.orderNumber) {
      noteParts.push(`Order: ${ppTransaction.orderNumber}`);
    }

    return {
      description: shortDesc,
      notes: noteParts.join('\n'),
    };
  }

  /**
   * Apply matched descriptions and notes to transactions
   */
  async applyDescriptions(
    matches: Array<{
      transactionId: string;
      journalId: string;
      newDescription: string;
      newNotes?: string;
    }>
  ): Promise<BulkUpdateResult> {
    const result: BulkUpdateResult = {
      successful: [],
      failed: [],
    };

    for (const match of matches) {
      try {
        // Get current transaction to merge tags
        const currentTransaction = await this.fireflyApi.getTransaction(match.transactionId);
        const currentSplit = currentTransaction.attributes.transactions.find(
          (t) => t.transaction_journal_id === match.journalId
        );
        const existingTags = currentSplit?.tags || [];

        // Add our tag if not already present
        const newTags = existingTags.includes(PAYPAL_EXTENDER_TAG)
          ? existingTags
          : [...existingTags, PAYPAL_EXTENDER_TAG];

        const updateData: { description: string; notes?: string; tags: string[] } = {
          description: match.newDescription,
          tags: newTags,
        };

        if (match.newNotes) {
          updateData.notes = match.newNotes;
        }

        await this.fireflyApi.updateTransaction(match.transactionId, match.journalId, updateData);
        result.successful.push(match.transactionId);
      } catch (error) {
        result.failed.push({
          transactionId: match.transactionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Get currently loaded PayPal transactions
   */
  getLoadedTransactions(): PayPalTransaction[] {
    return this.paypalTransactions;
  }

  /**
   * Clear loaded transactions
   */
  clearTransactions(): void {
    this.paypalTransactions = [];
  }
}
