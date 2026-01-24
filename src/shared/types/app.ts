// Application-specific types

import type { FireflyTransactionSplit, FireflyTransaction } from './firefly';

// Duplicate Transaction Types
export interface DuplicateConfidenceBreakdown {
  dateMatch: number;
  amountMatch: number;
  descriptionMatch: number;
  sourceAccountMatch: number;
  destinationAccountMatch: number;
  externalIdMatch: number;
  importHashMatch: number;
}

export interface DuplicateGroup {
  id: string;
  transactions: FireflyTransaction[];
  matchScore: number;
  matchReasons: string[];
  confidenceBreakdown?: DuplicateConfidenceBreakdown;
}

export interface DuplicateFinderOptions {
  dateRange?: number; // days to consider for date matching
  amountTolerance?: number; // percentage tolerance for amount matching
  includeDescriptionMatch?: boolean;
  includeSourceMatch?: boolean;
  includeDestinationMatch?: boolean;
}

// Subscription Finder Types (finds patterns to create Firefly subscriptions)
export interface SubscriptionConfidenceBreakdown {
  intervalConsistency: number; // 50% max weight - how consistent the timing is
  descriptionSimilarity: number; // 30% max weight - how similar descriptions are
  occurrenceCount: number; // 15% max weight - number of occurrences (normalized)
  amountConsistency: number; // 5% max weight - how consistent amounts are
  paymentServicePenalty: number; // -10% penalty for payment services (0 or negative)
}

export interface SubscriptionPattern {
  id: string;
  transactions: FireflyTransaction[];
  pattern: {
    type: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
    interval: number; // for weekly: skip value (0=every week, 1=every other week)
    dayOfWeek?: number;
    dayOfMonth?: number;
    confidence: number;
  };
  minAmount: number;
  maxAmount: number;
  averageAmount: number;
  description: string;
  sourceAccount: string;
  destinationAccount: string;
  reasons: string[];
  confidenceBreakdown?: SubscriptionConfidenceBreakdown;
}

export interface SubscriptionFinderOptions {
  minOccurrences?: number;
  maxDateVariance?: number; // days - variance allowed in interval timing
  amountTolerance?: number; // percentage - how much amounts can vary (less important for subscriptions)
  descriptionSimilarity?: number; // 0-1, minimum similarity for fuzzy description matching
  excludeLinkedToSubscriptions?: boolean; // Hide transactions already linked to bills
}

// Legacy aliases for backwards compatibility
export type RecurringPattern = SubscriptionPattern;
export type RecurringFinderOptions = SubscriptionFinderOptions;

// AI Suggestion Types
export interface CategorySuggestion {
  transactionId: string;
  transaction: FireflyTransactionSplit;
  suggestedCategoryId: string;
  suggestedCategoryName: string;
  confidence: number;
  reasoning: string;
  /** True when AI could not find a fitting category */
  unableToClassify?: boolean;
}

export interface TagSuggestion {
  transactionId: string;
  transaction: FireflyTransactionSplit;
  suggestedTags: Array<{
    tagId: string;
    tagName: string;
    confidence: number;
    reasoning: string;
  }>;
}

export interface AISuggestionOptions {
  maxSuggestions?: number;
  minConfidence?: number;
}

// Amazon Order Types (from Amazon Order History Exporter)
export interface AmazonOrderPromotion {
  description: string;
  amount: number;
}

export interface AmazonOrderItem {
  title: string;
  asin: string;
  quantity: number;
  price: number;
  discount: number;
  itemUrl: string;
}

export interface AmazonOrder {
  orderId: string;
  orderDate: string;
  totalAmount: number;
  currency: string;
  items: AmazonOrderItem[];
  orderStatus: string;
  detailsUrl: string;
  promotions: AmazonOrderPromotion[];
  totalSavings: number;
}

export interface ConfidenceBreakdown {
  orderIdMatch: number;
  amountMatch: number;
  exactAmountBonus: number;
  dateProximity: number;
  itemTitleMatch: number;
}

export interface AmazonMatchResult {
  transactionId: string;
  transaction: FireflyTransactionSplit;
  matchedOrder: AmazonOrder | null;
  matchConfidence: number;
  confidenceBreakdown?: ConfidenceBreakdown;
  suggestedDescription: string;
  suggestedNotes: string;
}

// PayPal Activity Report Types
export interface PayPalTransaction {
  // Core transaction info
  date: string; // Datum
  time: string; // Uhrzeit
  timezone: string; // Zeitzone
  name: string; // Name
  type: string; // Typ
  status: string; // Status
  currency: string; // Währung
  gross: number; // Brutto
  fee: number; // Gebühr
  net: number; // Netto

  // Email addresses
  senderEmail: string; // Absender E-Mail-Adresse
  recipientEmail: string; // Empfänger E-Mail-Adresse

  // Transaction identifiers
  transactionCode: string; // Transaktionscode
  counterpartyStatus: string; // Status Gegenpartei
  relatedTransactionCode: string; // Zugehöriger Transaktionscode
  invoiceNumber: string; // Rechnungsnummer
  receiptNumber: string; // Empfangsnummer

  // Shipping info
  shippingAddress: string; // Lieferadresse
  addressStatus: string; // Adress-Status
  addressLine1: string; // Adresszeile 1
  addressLine2: string; // Adresszusatz
  city: string; // Ort
  state: string; // Bundesland
  postalCode: string; // PLZ
  country: string; // Land
  phone: string; // Telefon

  // Item details
  itemDescription: string; // Artikelbezeichnung
  itemNumber: string; // Artikelnummer
  shippingAndHandlingFee: number; // Versand- und Bearbeitungsgebühr
  insuranceAmount: number; // Versicherungsbetrag
  salesTax: number; // Umsatzsteuer
  quantity: number; // Anzahl
  itemUrl: string; // Artikel-URL
  itemDetails: string; // Artikeldetails

  // Options
  option1Name: string; // Option 1 Name
  option1Value: string; // Option 1 Wert
  option2Name: string; // Option 2 Name
  option2Value: string; // Option 2 Wert

  // Auction info
  auctionSite: string; // Auktions-Site
  buyerId: string; // Käufer-ID
  endDate: string; // Enddatum

  // Reference numbers
  caseNumber: string; // Vorgangs-Nr.
  customsNumber: string; // Zollnummer
  orderNumber: string; // Bestellnummer
  customerReferenceNumber: string; // Kundenreferenznummer
  payflowTransactionCode: string; // Payflow-Transaktionscode (PNREF)
  originalInvoiceNumber: string; // Ursprüngliche Rechnungsnummer

  // Balance info
  balance: number; // Guthaben
  balanceImpact: string; // Auswirkung auf Guthaben

  // Subject and notes
  subject: string; // Betreff
  note: string; // Hinweis
  note1: string; // Anmerkung 1
  note2: string; // Anmerkung 2

  // Payment info
  paymentSource: string; // Zahlungsquelle
  paymentSourceSubtype: string; // Unterart der Zahlungsquelle
  cardType: string; // Kartentyp
  transactionEventCode: string; // Transaktionsereigniscode
  paymentTrackingId: string; // Zahlungsverfolgungs-ID
  bankReference: string; // Bankreferenz

  // Buyer info
  buyerCountryCode: string; // Ländercode des Käufers
  countryDialingCode: string; // Ländervorwahl
  buyerEWallet: string; // E-Börse des Käufers

  // Discounts and offers
  coupons: string; // Gutscheine
  specialOffers: string; // Sonderangebote
  tip: number; // Trinkgeld
  discount: number; // Rabatt

  // Protection and authorization
  customerCardNumber: string; // Kundenkartennummer
  authorizationStatus: string; // Autorisierungsstatus
  sellerProtectionEligibility: string; // Anspruch auf Verkäuferschutz

  // Seller info
  sellerId: string; // Verkäufer-ID
  riskFilter: string; // Risikofilter

  // Installment/financing
  installmentTransactionFee: number; // Transaktionsgebühr für Ratenzahlungen
  zeroPercentFinancingFee: number; // Zusatzgebühr für Null-Prozent-Finanzierung
  paymentTerm: string; // Zahlungsziel
  creditOfferType: string; // Art des Kreditangebots

  // Campaign
  campaignFee: number; // Kampagnengebühr
  campaignName: string; // Name der Kampagne
  campaignDiscount: number; // Kampagnenrabatt
  campaignDiscountCurrency: string; // Währung des Kampagnenrabatts

  // Misc
  rejectionCode: string; // Ablehnungscode
  fastlaneCheckoutTransaction: string; // Fastlane-Checkout-Transaktion
  rewardPoints: string; // Prämienpunkte
}

export interface PayPalConfidenceBreakdown {
  transactionCodeMatch: number;
  bankReferenceMatch: number;
  amountMatch: number;
  exactAmountBonus: number;
  dateProximity: number;
  nameMatch: number;
}

export interface PayPalMatchResult {
  transactionId: string;
  transaction: FireflyTransactionSplit;
  matchedPayPalTransaction: PayPalTransaction | null;
  matchConfidence: number;
  confidenceBreakdown?: PayPalConfidenceBreakdown;
  suggestedDescription: string;
  suggestedNotes: string;
}

// API Response Types
export interface ValidationError {
  field: string;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  /** Field-level validation errors, present when success=false due to invalid input */
  validationErrors?: ValidationError[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Tool Status Types
export interface ToolStatus {
  name: string;
  available: boolean;
  requiresConfig: string[];
  description: string;
}

// Configuration Types
export interface AppConfig {
  fireflyApiUrl: string;
  fireflyApiToken: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

// Transaction Update Types
export interface TransactionUpdate {
  transactionId: string;
  journalId: string;
  updates: {
    category_id?: string;
    category_name?: string;
    tags?: string[];
    description?: string;
    notes?: string;
  };
}

export interface BulkUpdateResult {
  successful: string[];
  failed: Array<{
    transactionId: string;
    error: string;
  }>;
}

// Subscription Creation (creates a Firefly subscription/bill)
export interface CreateSubscriptionRequest {
  name: string;
  amountMin: string;
  amountMax: string;
  date: string; // First expected date
  repeatFreq: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
  skip?: number; // 0 = every time, 1 = skip every other, etc.
  currencyCode?: string;
  currencyId?: string;
  endDate?: string;
  extensionDate?: string;
  notes?: string;
  active?: boolean;
  // For rule creation
  destinationAccountName?: string;
  createRule?: boolean; // Whether to also create a rule for this subscription
}

// Legacy alias for backwards compatibility
export type CreateRecurringRequest = CreateSubscriptionRequest;

// FinTS Importer Types
export interface FinTSConfig {
  /** Bank BLZ/BIC */
  bankCode: string;
  /** FinTS server URL */
  url: string;
  /** User login ID */
  userId: string;
  /** User PIN */
  pin: string;
  /** Product ID (optional, for registration) */
  productId?: string;
}

export interface FinTSAccount {
  /** Account number (IBAN or legacy) */
  accountNumber: string;
  /** Account owner name */
  ownerName: string;
  /** Account type description */
  accountType: string;
  /** Currency code */
  currency: string;
  /** BLZ/BIC */
  bankCode: string;
  /** IBAN if available */
  iban?: string;
  /** BIC if available */
  bic?: string;
  /** Current balance if available */
  balance?: number;
  /** Supported FinTS segments for this account */
  supportedSegments?: string[];
}

export interface FinTSTransaction {
  /** Unique reference if available */
  reference?: string;
  /** Booking date */
  bookingDate: string;
  /** Value date */
  valueDate: string;
  /** Amount (positive = credit, negative = debit) */
  amount: number;
  /** Currency code */
  currency: string;
  /** Counterparty name */
  counterpartyName?: string;
  /** Counterparty IBAN */
  counterpartyIban?: string;
  /** Counterparty BIC */
  counterpartyBic?: string;
  /** Purpose/description lines */
  purpose: string;
  /** Transaction type (e.g., SEPA transfer, direct debit) */
  transactionType?: string;
  /** End-to-end reference */
  endToEndReference?: string;
  /** Mandate reference (for direct debits) */
  mandateReference?: string;
  /** Creditor ID (for direct debits) */
  creditorId?: string;
  /** Raw booking text */
  bookingText?: string;
  /** Prima nota */
  primaNota?: string;
  /** Whether this is a booked transaction (false = pending/displayed) */
  booked?: boolean;
  /** Whether this is a reversal/storno */
  isStorno?: boolean;
}

export interface FinTSFetchOptions {
  /** Account to fetch transactions from */
  account: FinTSAccount;
  /** Start date for transaction fetch (YYYY-MM-DD) */
  startDate: string;
  /** End date for transaction fetch (YYYY-MM-DD) */
  endDate: string;
}

export interface FinTSTanMethod {
  /** TAN method ID (e.g., 910, 913, 940) */
  id: string;
  /** TAN method name (e.g., "chipTAN manuell", "DKB App") */
  name: string;
  /** Technical name (e.g., "HHD1.3.0", "SealOne") */
  technicalName: string;
  /** Whether this is a decoupled method (push notification) */
  isDecoupled: boolean;
  /** Version of the method */
  version: string;
}

export interface FinTSTanRequest {
  /** Type of TAN process */
  tanProcess: 'singleStep' | 'twoStep' | 'decoupled';
  /** Selected TAN method ID */
  tanMethodId?: string;
  /** TAN medium name if applicable */
  tanMedium?: string;
  /** Challenge text to display to user */
  challengeText: string;
  /** Challenge data for QR/photoTAN if applicable */
  challengeData?: string;
  /** Challenge data format (e.g., 'HHD', 'QR') */
  challengeFormat?: string;
  /** Dialog ID for continuing the process */
  dialogId: string;
  /** Order reference for TAN submission */
  orderRef?: string;
}

export interface FinTSDialogState {
  /** Dialog ID for multi-step operations */
  dialogId: string;
  /** Whether TAN is required */
  tanRequired: boolean;
  /** TAN request details if TAN is required */
  tanRequest?: FinTSTanRequest;
  /** Available TAN methods */
  tanMethods?: FinTSTanMethod[];
  /** Selected TAN method */
  selectedTanMethod?: string;
  /** List of available accounts after successful login */
  accounts?: FinTSAccount[];
  /** Fetched transactions */
  transactions?: FinTSTransaction[];
  /** Current status message */
  statusMessage?: string;
}

export interface FinTSImportResult {
  /** Original FinTS transaction */
  fintsTransaction: FinTSTransaction;
  /** Suggested Firefly transaction data */
  fireflyTransaction: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    date: string;
    amount: string;
    description: string;
    source_name?: string;
    source_iban?: string;
    destination_name?: string;
    destination_iban?: string;
    notes?: string;
    external_id?: string;
  };
  /** Whether this transaction likely already exists */
  possibleDuplicate: boolean;
  /** Import status */
  status: 'pending' | 'imported' | 'skipped' | 'error';
  /** Error message if status is 'error' */
  errorMessage?: string;
}
