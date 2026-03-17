import type {
  AmazonOrder,
  AmazonMatchResult,
  ConfidenceBreakdown as AmazonConfidenceBreakdown,
  PayPalConfidenceBreakdown,
  PayPalMatchResult,
  PayPalTransaction,
} from '../types/app';
import type { FireflyTransactionSplit } from '../types/firefly';

export type ExtenderMatchMethod = 'automatic' | 'manual';

export const MANUAL_MATCH_CONFIDENCE = 1;

const AMAZON_MAX_ITEM_LENGTH = 50;
const PAYPAL_MAX_DESC_LENGTH = 50;

export function getAmazonOrderIdentity(order: AmazonOrder): string {
  return order.orderId;
}

export function getPayPalTransactionIdentity(transaction: PayPalTransaction): string {
  if (transaction.transactionCode) {
    return transaction.transactionCode;
  }

  return [
    transaction.date,
    transaction.time,
    transaction.name,
    transaction.type,
    transaction.gross.toFixed(2),
    transaction.currency,
    transaction.bankReference,
  ].join('::');
}

export function buildAmazonSuggestedDetails(order: AmazonOrder): {
  description: string;
  notes: string;
} {
  const fullItemsList = order.items.map((item) => {
    if (item.quantity > 1) {
      return `${item.quantity}x ${item.title}`;
    }
    return item.title;
  });

  const shortItemsList = order.items.map((item) => {
    let title = item.title;
    if (title.length > AMAZON_MAX_ITEM_LENGTH) {
      title = title.substring(0, AMAZON_MAX_ITEM_LENGTH - 3) + '...';
    }
    if (item.quantity > 1) {
      return `${item.quantity}x ${title}`;
    }
    return title;
  });

  return {
    description: `Amazon ${order.orderId}: ${shortItemsList.join(', ')}`,
    notes: `Amazon Order ${order.orderId}\n\nItems:\n${fullItemsList.map((item) => `• ${item}`).join('\n')}`,
  };
}

export function buildPayPalSuggestedDetails(transaction: PayPalTransaction): {
  description: string;
  notes: string;
} {
  let shortDescription = transaction.name || 'PayPal';
  if (transaction.itemDescription) {
    const itemDescription =
      transaction.itemDescription.length > PAYPAL_MAX_DESC_LENGTH
        ? transaction.itemDescription.substring(0, PAYPAL_MAX_DESC_LENGTH - 3) + '...'
        : transaction.itemDescription;
    shortDescription = `${transaction.name}: ${itemDescription}`;
  }

  if (shortDescription.length > 100) {
    shortDescription = shortDescription.substring(0, 97) + '...';
  }

  const noteParts: string[] = [];
  noteParts.push(`PayPal Transaction: ${transaction.transactionCode}`);
  noteParts.push(`Date: ${transaction.date} ${transaction.time}`);
  noteParts.push(`Type: ${transaction.type}`);
  noteParts.push(`Name: ${transaction.name}`);

  if (transaction.recipientEmail) {
    noteParts.push(`Recipient: ${transaction.recipientEmail}`);
  }

  if (transaction.itemDescription) {
    noteParts.push(`\nItem: ${transaction.itemDescription}`);
  }

  if (transaction.quantity && transaction.quantity > 0) {
    noteParts.push(`Quantity: ${transaction.quantity}`);
  }

  noteParts.push(`\nGross: ${transaction.gross.toFixed(2)} ${transaction.currency}`);
  if (transaction.fee !== 0) {
    noteParts.push(`Fee: ${transaction.fee.toFixed(2)} ${transaction.currency}`);
  }
  noteParts.push(`Net: ${transaction.net.toFixed(2)} ${transaction.currency}`);

  if (transaction.subject) {
    noteParts.push(`\nSubject: ${transaction.subject}`);
  }

  if (transaction.note) {
    noteParts.push(`Note: ${transaction.note}`);
  }

  if (transaction.invoiceNumber) {
    noteParts.push(`Invoice: ${transaction.invoiceNumber}`);
  }

  if (transaction.orderNumber) {
    noteParts.push(`Order: ${transaction.orderNumber}`);
  }

  return {
    description: shortDescription,
    notes: noteParts.join('\n'),
  };
}

interface CreateAmazonMatchResultArgs {
  transactionId: string;
  transaction: FireflyTransactionSplit;
  matchedOrder: AmazonOrder | null;
  matchConfidence?: number;
  confidenceBreakdown?: AmazonConfidenceBreakdown;
  matchMethod?: ExtenderMatchMethod;
}

export function createAmazonMatchResult({
  transactionId,
  transaction,
  matchedOrder,
  matchConfidence = 0,
  confidenceBreakdown,
  matchMethod = 'automatic',
}: CreateAmazonMatchResultArgs): AmazonMatchResult {
  const suggested = matchedOrder
    ? buildAmazonSuggestedDetails(matchedOrder)
    : { description: transaction.description, notes: '' };

  return {
    transactionId,
    transaction,
    matchedOrder,
    matchConfidence,
    confidenceBreakdown,
    suggestedDescription: suggested.description,
    suggestedNotes: suggested.notes,
    matchMethod,
  };
}

export function createAmazonUnmatchedResult(args: {
  transactionId: string;
  transaction: FireflyTransactionSplit;
}): AmazonMatchResult {
  return createAmazonMatchResult({
    ...args,
    matchedOrder: null,
    matchConfidence: 0,
    confidenceBreakdown: undefined,
    matchMethod: 'automatic',
  });
}

interface CreatePayPalMatchResultArgs {
  transactionId: string;
  transaction: FireflyTransactionSplit;
  matchedPayPalTransaction: PayPalTransaction | null;
  matchConfidence?: number;
  confidenceBreakdown?: PayPalConfidenceBreakdown;
  matchMethod?: ExtenderMatchMethod;
}

export function createPayPalMatchResult({
  transactionId,
  transaction,
  matchedPayPalTransaction,
  matchConfidence = 0,
  confidenceBreakdown,
  matchMethod = 'automatic',
}: CreatePayPalMatchResultArgs): PayPalMatchResult {
  const suggested = matchedPayPalTransaction
    ? buildPayPalSuggestedDetails(matchedPayPalTransaction)
    : { description: transaction.description, notes: '' };

  return {
    transactionId,
    transaction,
    matchedPayPalTransaction,
    matchConfidence,
    confidenceBreakdown,
    suggestedDescription: suggested.description,
    suggestedNotes: suggested.notes,
    matchMethod,
  };
}

export function createPayPalUnmatchedResult(args: {
  transactionId: string;
  transaction: FireflyTransactionSplit;
}): PayPalMatchResult {
  return createPayPalMatchResult({
    ...args,
    matchedPayPalTransaction: null,
    matchConfidence: 0,
    confidenceBreakdown: undefined,
    matchMethod: 'automatic',
  });
}
