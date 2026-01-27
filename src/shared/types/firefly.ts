// Firefly III API Types

// Subscription (formerly "Bill") - tracks expected recurring expenses
export interface FireflySubscription {
  id: string;
  type: string;
  attributes: {
    created_at: string;
    updated_at: string;
    currency_id: string;
    currency_code: string;
    currency_symbol: string;
    currency_decimal_places: number;
    name: string;
    amount_min: string;
    amount_max: string;
    date: string; // First expected date
    end_date: string | null;
    extension_date: string | null;
    repeat_freq: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
    skip: number; // 0 = every time, 1 = skip every other, etc.
    active: boolean;
    order: number;
    notes: string | null;
    object_group_id: string | null;
    object_group_title: string | null;
    object_group_order: number | null;
    // Enriched data (when using date range query params)
    pay_dates?: string[];
    paid_dates?: Array<{
      transaction_group_id: string;
      transaction_journal_id: string;
      date: string;
    }>;
  };
}

export interface FireflyTransaction {
  id: string;
  type: string;
  attributes: {
    created_at: string;
    updated_at: string;
    user: string;
    group_title: string | null;
    transactions: FireflyTransactionSplit[];
  };
}

export interface FireflyTransactionSplit {
  user: string;
  transaction_journal_id: string;
  type: 'withdrawal' | 'deposit' | 'transfer' | 'reconciliation' | 'opening balance';
  date: string;
  order: number;
  currency_id: string;
  currency_code: string;
  currency_symbol: string;
  currency_decimal_places: number;
  foreign_currency_id: string | null;
  foreign_currency_code: string | null;
  foreign_currency_symbol: string | null;
  foreign_currency_decimal_places: number | null;
  amount: string;
  foreign_amount: string | null;
  description: string;
  source_id: string;
  source_name: string;
  source_iban: string | null;
  source_type: string;
  destination_id: string;
  destination_name: string;
  destination_iban: string | null;
  destination_type: string;
  budget_id: string | null;
  budget_name: string | null;
  category_id: string | null;
  category_name: string | null;
  bill_id: string | null;
  bill_name: string | null;
  reconciled: boolean;
  notes: string | null;
  tags: string[];
  internal_reference: string | null;
  external_id: string | null;
  external_url: string | null;
  original_source: string | null;
  recurrence_id: string | null;
  recurrence_total: number | null;
  recurrence_count: number | null;
  bunq_payment_id: string | null;
  import_hash_v2: string | null;
  sepa_cc: string | null;
  sepa_ct_op: string | null;
  sepa_ct_id: string | null;
  sepa_db: string | null;
  sepa_country: string | null;
  sepa_ep: string | null;
  sepa_ci: string | null;
  sepa_batch_id: string | null;
  interest_date: string | null;
  book_date: string | null;
  process_date: string | null;
  due_date: string | null;
  payment_date: string | null;
  invoice_date: string | null;
  latitude: number | null;
  longitude: number | null;
  zoom_level: number | null;
  has_attachments: boolean;
}

export interface FireflyCategory {
  id: string;
  type: string;
  attributes: {
    created_at: string;
    updated_at: string;
    name: string;
    notes: string | null;
    spent: FireflyCategorySpent[];
    earned: FireflyCategoryEarned[];
  };
}

export interface FireflyCategorySpent {
  currency_id: string;
  currency_code: string;
  currency_symbol: string;
  currency_decimal_places: number;
  sum: string;
}

export interface FireflyCategoryEarned {
  currency_id: string;
  currency_code: string;
  currency_symbol: string;
  currency_decimal_places: number;
  sum: string;
}

export interface FireflyTag {
  id: string;
  type: string;
  attributes: {
    created_at: string;
    updated_at: string;
    tag: string;
    date: string | null;
    description: string | null;
    latitude: number | null;
    longitude: number | null;
    zoom_level: number | null;
  };
}

export interface FireflyAccount {
  id: string;
  type: string;
  attributes: {
    created_at: string;
    updated_at: string;
    active: boolean;
    order: number | null;
    name: string;
    type: string;
    account_role: string | null;
    currency_id: string;
    currency_code: string;
    currency_symbol: string;
    currency_decimal_places: number;
    current_balance: string;
    current_balance_date: string;
    iban: string | null;
    bic: string | null;
    account_number: string | null;
    opening_balance: string;
    current_debt: string | null;
    opening_balance_date: string | null;
    virtual_balance: string;
    include_net_worth: boolean;
    credit_card_type: string | null;
    monthly_payment_date: string | null;
    liability_type: string | null;
    liability_direction: string | null;
    interest: string | null;
    interest_period: string | null;
    notes: string | null;
    latitude: number | null;
    longitude: number | null;
    zoom_level: number | null;
  };
}

export interface FireflyRecurringTransaction {
  id: string;
  type: string;
  attributes: {
    created_at: string;
    updated_at: string;
    type: string;
    title: string;
    description: string;
    first_date: string;
    latest_date: string | null;
    repeat_until: string | null;
    nr_of_repetitions: number | null;
    apply_rules: boolean;
    active: boolean;
    notes: string | null;
    repetitions: FireflyRecurrence[];
    transactions: FireflyRecurrenceTransaction[];
  };
}

export interface FireflyRecurrence {
  id: string;
  type: string;
  moment: string;
  skip: number;
  weekend: number;
  description: string;
  occurrences: string[];
}

export interface FireflyRecurrenceTransaction {
  id: string;
  description: string;
  amount: string;
  foreign_amount: string | null;
  currency_id: string;
  currency_code: string;
  currency_symbol: string;
  currency_decimal_places: number;
  foreign_currency_id: string | null;
  foreign_currency_code: string | null;
  foreign_currency_symbol: string | null;
  foreign_currency_decimal_places: number | null;
  budget_id: string | null;
  budget_name: string | null;
  category_id: string | null;
  category_name: string | null;
  source_id: string;
  source_name: string;
  source_iban: string | null;
  source_type: string;
  destination_id: string;
  destination_name: string;
  destination_iban: string | null;
  destination_type: string;
  tags: string[];
  piggy_bank_id: string | null;
  piggy_bank_name: string | null;
}

// Rule types
export interface FireflyRuleGroup {
  id: string;
  type: string;
  attributes: {
    created_at: string;
    updated_at: string;
    title: string;
    description: string | null;
    order: number;
    active: boolean;
  };
}

export interface FireflyRuleTrigger {
  id: string;
  type: string;
  value: string;
  order: number;
  active: boolean;
  stop_processing: boolean;
}

export interface FireflyRuleAction {
  id: string;
  type: string;
  value: string;
  order: number;
  active: boolean;
  stop_processing: boolean;
}

export interface FireflyRule {
  id: string;
  type: string;
  attributes: {
    created_at: string;
    updated_at: string;
    title: string;
    description: string | null;
    rule_group_id: string;
    rule_group_title: string;
    order: number;
    trigger: string;
    active: boolean;
    strict: boolean;
    stop_processing: boolean;
    triggers: FireflyRuleTrigger[];
    actions: FireflyRuleAction[];
  };
}

export interface FireflyApiResponse<T> {
  data: T;
  meta?: {
    pagination?: {
      total: number;
      count: number;
      per_page: number;
      current_page: number;
      total_pages: number;
    };
  };
  links?: {
    self: string;
    first: string;
    last: string;
    prev: string | null;
    next: string | null;
  };
}
