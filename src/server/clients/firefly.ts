import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import type {
  FireflyTransaction,
  FireflyCategory,
  FireflyTag,
  FireflyAccount,
  FireflyRecurringTransaction,
  FireflySubscription,
  FireflyRule,
  FireflyRuleGroup,
  FireflyApiResponse,
} from '../../shared/types/firefly.js';

const logger = createLogger('FireflyClient');

export class FireflyApiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(apiUrl?: string, apiToken?: string) {
    this.baseUrl = apiUrl || config.firefly.apiUrl;
    const token = apiToken || config.firefly.apiToken;

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.api+json',
      },
      timeout: 30000,
    });

    // Configure automatic retries for transient errors (5xx and network issues)
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        // Retry on network errors or 5xx server errors
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status !== undefined && error.response.status >= 500)
        );
      },
    });
  }

  private handleError(error: unknown): never {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      // Log detailed error information
      logger.error(`Firefly API error [${status}]: ${message}`, {
        url: error.config?.url,
        method: error.config?.method,
        data: error.config?.data ? 'payload omitted' : undefined,
      });

      if (status === 401) {
        throw new Error('Firefly III authentication failed. Please check your API token.');
      }
      if (status === 404) {
        throw new Error('Firefly III resource not found.');
      }
      if (status === 422) {
        const validationErrors = error.response?.data?.errors;
        throw new Error(`Validation error: ${JSON.stringify(validationErrors)}`);
      }
      throw new Error(`Firefly III API error: ${message}`);
    }
    throw error;
  }

  // ============ Transactions ============

  async getTransactions(
    startDate?: string,
    endDate?: string,
    type?: string,
    page: number = 1,
    limit: number = 50
  ): Promise<FireflyApiResponse<FireflyTransaction[]>> {
    try {
      const params: Record<string, string | number> = { page, limit };
      if (startDate) params.start = startDate;
      if (endDate) params.end = endDate;
      if (type) params.type = type;

      const response = await this.client.get<FireflyApiResponse<FireflyTransaction[]>>(
        '/transactions',
        { params }
      );
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getAllTransactions(
    startDate?: string,
    endDate?: string,
    type?: string
  ): Promise<FireflyTransaction[]> {
    const allTransactions: FireflyTransaction[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getTransactions(startDate, endDate, type, page, 100);
      allTransactions.push(...response.data);

      const pagination = response.meta?.pagination;
      if (pagination && pagination.current_page < pagination.total_pages) {
        page++;
      } else {
        hasMore = false;
      }
    }

    return allTransactions;
  }

  async getTransaction(id: string): Promise<FireflyTransaction> {
    try {
      const response = await this.client.get<FireflyApiResponse<FireflyTransaction>>(
        `/transactions/${id}`
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async updateTransaction(
    id: string,
    journalId: string,
    updates: {
      category_id?: string;
      category_name?: string;
      tags?: string[];
      description?: string;
      notes?: string;
    }
  ): Promise<FireflyTransaction> {
    try {
      // First get the current transaction to preserve other fields
      const current = await this.getTransaction(id);
      const currentSplit = current.attributes.transactions.find(
        (t) => t.transaction_journal_id === journalId
      );

      if (!currentSplit) {
        throw new Error(`Transaction journal ${journalId} not found in transaction ${id}`);
      }

      const updatePayload = {
        transactions: [
          {
            transaction_journal_id: journalId,
            type: currentSplit.type,
            date: currentSplit.date,
            amount: currentSplit.amount,
            description: updates.description ?? currentSplit.description,
            source_id: currentSplit.source_id,
            destination_id: currentSplit.destination_id,
            category_id: updates.category_id ?? currentSplit.category_id,
            category_name: updates.category_name ?? currentSplit.category_name,
            tags: updates.tags ?? currentSplit.tags,
            notes: updates.notes ?? currentSplit.notes,
          },
        ],
      };

      const response = await this.client.put<FireflyApiResponse<FireflyTransaction>>(
        `/transactions/${id}`,
        updatePayload
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    try {
      await this.client.delete(`/transactions/${id}`);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Add tags to an existing transaction without affecting other fields.
   * This is useful for adding import tags after creation to avoid affecting duplicate detection.
   */
  async addTagsToTransaction(id: string, tagsToAdd: string[]): Promise<FireflyTransaction> {
    try {
      const current = await this.getTransaction(id);
      const firstSplit = current.attributes.transactions[0];

      if (!firstSplit) {
        throw new Error(`No transaction splits found in transaction ${id}`);
      }

      // Merge existing tags with new tags (deduplicated)
      const existingTags = firstSplit.tags || [];
      const mergedTags = [...new Set([...existingTags, ...tagsToAdd])];

      const updatePayload = {
        transactions: [
          {
            transaction_journal_id: firstSplit.transaction_journal_id,
            type: firstSplit.type,
            date: firstSplit.date,
            amount: firstSplit.amount,
            description: firstSplit.description,
            source_id: firstSplit.source_id,
            destination_id: firstSplit.destination_id,
            tags: mergedTags,
          },
        ],
      };

      const response = await this.client.put<FireflyApiResponse<FireflyTransaction>>(
        `/transactions/${id}`,
        updatePayload
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async createTransaction(data: {
    error_if_duplicate_hash?: boolean;
    apply_rules?: boolean;
    fire_webhooks?: boolean;
    transactions: Array<{
      type: 'withdrawal' | 'deposit' | 'transfer';
      date: string;
      amount: string;
      description: string;
      source_name?: string;
      destination_name?: string;
      source_id?: string;
      destination_id?: string;
      category_name?: string;
      category_id?: string;
      budget_name?: string;
      budget_id?: string;
      tags?: string[];
      notes?: string;
      currency_code?: string;
      currency_id?: string;
      foreign_amount?: string;
      foreign_currency_code?: string;
      foreign_currency_id?: string;
      internal_reference?: string;
      external_id?: string;
      external_url?: string;
      sepa_cc?: string;
      sepa_ct_op?: string;
      sepa_ct_id?: string;
      sepa_db?: string;
      sepa_country?: string;
      sepa_ep?: string;
      sepa_ci?: string;
      sepa_batch_id?: string;
      interest_date?: string;
      book_date?: string;
      process_date?: string;
      due_date?: string;
      payment_date?: string;
      invoice_date?: string;
    }>;
  }): Promise<FireflyTransaction> {
    try {
      const response = await this.client.post<FireflyApiResponse<FireflyTransaction>>(
        '/transactions',
        data
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============ Categories ============

  async getCategories(page: number = 1, limit: number = 50): Promise<FireflyCategory[]> {
    try {
      const response = await this.client.get<FireflyApiResponse<FireflyCategory[]>>('/categories', {
        params: { page, limit },
      });
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getAllCategories(): Promise<FireflyCategory[]> {
    const allCategories: FireflyCategory[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.get<FireflyApiResponse<FireflyCategory[]>>('/categories', {
        params: { page, limit: 100 },
      });

      allCategories.push(...response.data.data);

      const pagination = response.data.meta?.pagination;
      if (pagination && pagination.current_page < pagination.total_pages) {
        page++;
      } else {
        hasMore = false;
      }
    }

    return allCategories;
  }

  async createCategory(name: string, notes?: string): Promise<FireflyCategory> {
    try {
      const response = await this.client.post<FireflyApiResponse<FireflyCategory>>('/categories', {
        name,
        notes,
      });
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============ Tags ============

  async getTags(page: number = 1, limit: number = 50): Promise<FireflyTag[]> {
    try {
      const response = await this.client.get<FireflyApiResponse<FireflyTag[]>>('/tags', {
        params: { page, limit },
      });
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getAllTags(): Promise<FireflyTag[]> {
    const allTags: FireflyTag[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.get<FireflyApiResponse<FireflyTag[]>>('/tags', {
        params: { page, limit: 100 },
      });

      allTags.push(...response.data.data);

      const pagination = response.data.meta?.pagination;
      if (pagination && pagination.current_page < pagination.total_pages) {
        page++;
      } else {
        hasMore = false;
      }
    }

    return allTags;
  }

  async createTag(tag: string, description?: string): Promise<FireflyTag> {
    try {
      const response = await this.client.post<FireflyApiResponse<FireflyTag>>('/tags', {
        tag,
        description,
      });
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============ Accounts ============

  async getAccounts(
    type?: string,
    page: number = 1,
    limit: number = 50
  ): Promise<FireflyAccount[]> {
    try {
      const params: Record<string, string | number> = { page, limit };
      if (type) params.type = type;

      const response = await this.client.get<FireflyApiResponse<FireflyAccount[]>>('/accounts', {
        params,
      });
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getAllAccounts(type?: string): Promise<FireflyAccount[]> {
    const allAccounts: FireflyAccount[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params: Record<string, string | number> = { page, limit: 100 };
      if (type) params.type = type;

      const response = await this.client.get<FireflyApiResponse<FireflyAccount[]>>('/accounts', {
        params,
      });

      allAccounts.push(...response.data.data);

      const pagination = response.data.meta?.pagination;
      if (pagination && pagination.current_page < pagination.total_pages) {
        page++;
      } else {
        hasMore = false;
      }
    }

    return allAccounts;
  }

  // ============ Subscriptions (formerly Bills) ============

  async getSubscriptions(page: number = 1, limit: number = 50): Promise<FireflySubscription[]> {
    try {
      const response = await this.client.get<FireflyApiResponse<FireflySubscription[]>>(
        '/subscriptions',
        { params: { page, limit } }
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getAllSubscriptions(): Promise<FireflySubscription[]> {
    const allSubscriptions: FireflySubscription[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.get<FireflyApiResponse<FireflySubscription[]>>(
        '/subscriptions',
        { params: { page, limit: 100 } }
      );

      allSubscriptions.push(...response.data.data);

      const pagination = response.data.meta?.pagination;
      if (pagination && pagination.current_page < pagination.total_pages) {
        page++;
      } else {
        hasMore = false;
      }
    }

    return allSubscriptions;
  }

  async createSubscription(data: {
    name: string;
    amount_min: string;
    amount_max: string;
    date: string;
    repeat_freq: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
    skip?: number;
    currency_code?: string;
    currency_id?: string;
    end_date?: string;
    extension_date?: string;
    notes?: string;
    active?: boolean;
  }): Promise<FireflySubscription> {
    try {
      const response = await this.client.post<FireflyApiResponse<FireflySubscription>>(
        '/subscriptions',
        data
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============ Rules ============

  async getRuleGroups(page: number = 1, limit: number = 50): Promise<FireflyRuleGroup[]> {
    try {
      const response = await this.client.get<FireflyApiResponse<FireflyRuleGroup[]>>(
        '/rule-groups',
        { params: { page, limit } }
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getAllRuleGroups(): Promise<FireflyRuleGroup[]> {
    const allGroups: FireflyRuleGroup[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.client.get<FireflyApiResponse<FireflyRuleGroup[]>>(
        '/rule-groups',
        { params: { page, limit: 100 } }
      );
      allGroups.push(...response.data.data);

      const pagination = response.data.meta?.pagination;
      if (pagination && pagination.current_page < pagination.total_pages) {
        page++;
      } else {
        hasMore = false;
      }
    }

    return allGroups;
  }

  async createRuleGroup(data: {
    title: string;
    description?: string;
    active?: boolean;
    order?: number;
  }): Promise<FireflyRuleGroup> {
    try {
      const response = await this.client.post<FireflyApiResponse<FireflyRuleGroup>>(
        '/rule-groups',
        data
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async createRule(data: {
    title: string;
    description?: string;
    rule_group_id: string;
    rule_group_title?: string;
    order?: number;
    trigger: 'store-journal' | 'update-journal';
    active?: boolean;
    strict?: boolean;
    stop_processing?: boolean;
    triggers: Array<{
      type: string;
      value: string;
      order?: number;
      active?: boolean;
      stop_processing?: boolean;
    }>;
    actions: Array<{
      type: string;
      value: string;
      order?: number;
      active?: boolean;
      stop_processing?: boolean;
    }>;
  }): Promise<FireflyRule> {
    try {
      const response = await this.client.post<FireflyApiResponse<FireflyRule>>('/rules', data);
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============ Recurring Transactions ============

  async getRecurringTransactions(
    page: number = 1,
    limit: number = 50
  ): Promise<FireflyRecurringTransaction[]> {
    try {
      const response = await this.client.get<FireflyApiResponse<FireflyRecurringTransaction[]>>(
        '/recurrences',
        { params: { page, limit } }
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async createRecurringTransaction(data: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    title: string;
    description?: string;
    first_date: string;
    repeat_until?: string;
    nr_of_repetitions?: number;
    apply_rules?: boolean;
    active?: boolean;
    repetitions: Array<{
      type: 'daily' | 'weekly' | 'ndom' | 'monthly' | 'yearly';
      moment?: string;
      skip?: number;
      weekend?: number;
    }>;
    transactions: Array<{
      description: string;
      amount: string;
      currency_code: string;
      source_id: string;
      destination_id: string;
      category_id?: string;
      tags?: string[];
    }>;
  }): Promise<FireflyRecurringTransaction> {
    try {
      const response = await this.client.post<FireflyApiResponse<FireflyRecurringTransaction>>(
        '/recurrences',
        data
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============ Health Check ============

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.client.get('/about/user');
      return { success: true, message: 'Successfully connected to Firefly III' };
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.code === 'ECONNREFUSED') {
          return { success: false, message: 'Could not connect to Firefly III server' };
        }
        if (error.response?.status === 401) {
          return { success: false, message: 'Invalid API token' };
        }
        return { success: false, message: error.message };
      }
      return { success: false, message: 'Unknown error occurred' };
    }
  }
}

// Global instance that can be reinitialized
let fireflyApiInstance: FireflyApiClient | null = null;

/**
 * Error thrown when Firefly III is not configured.
 */
export class FireflyNotConfiguredError extends Error {
  constructor() {
    super(
      'Firefly III is not configured. Please set FIREFLY_API_URL and FIREFLY_API_TOKEN environment variables.'
    );
    this.name = 'FireflyNotConfiguredError';
  }
}

/**
 * Get the shared Firefly API client instance.
 * @throws {FireflyNotConfiguredError} if apiUrl or apiToken is missing from config
 */
export function getFireflyApi(): FireflyApiClient {
  if (!config.firefly.apiUrl || !config.firefly.apiToken) {
    throw new FireflyNotConfiguredError();
  }
  if (!fireflyApiInstance) {
    fireflyApiInstance = new FireflyApiClient();
  }
  return fireflyApiInstance;
}

/**
 * Reinitialize the Firefly API client (e.g., after config change).
 * @throws {FireflyNotConfiguredError} if apiUrl or apiToken is missing from config
 */
export function reinitializeFireflyApi(): FireflyApiClient {
  if (!config.firefly.apiUrl || !config.firefly.apiToken) {
    throw new FireflyNotConfiguredError();
  }
  fireflyApiInstance = new FireflyApiClient();
  return fireflyApiInstance;
}

// Legacy export for backward compatibility
export const fireflyApi = {
  get instance() {
    return getFireflyApi();
  },
  testConnection() {
    return getFireflyApi().testConnection();
  },
  getTransactions(...args: Parameters<FireflyApiClient['getTransactions']>) {
    return getFireflyApi().getTransactions(...args);
  },
  getAllTransactions(...args: Parameters<FireflyApiClient['getAllTransactions']>) {
    return getFireflyApi().getAllTransactions(...args);
  },
  getTransaction(...args: Parameters<FireflyApiClient['getTransaction']>) {
    return getFireflyApi().getTransaction(...args);
  },
  updateTransaction(...args: Parameters<FireflyApiClient['updateTransaction']>) {
    return getFireflyApi().updateTransaction(...args);
  },
  deleteTransaction(...args: Parameters<FireflyApiClient['deleteTransaction']>) {
    return getFireflyApi().deleteTransaction(...args);
  },
  getCategories(...args: Parameters<FireflyApiClient['getCategories']>) {
    return getFireflyApi().getCategories(...args);
  },
  getAllCategories() {
    return getFireflyApi().getAllCategories();
  },
  getTags(...args: Parameters<FireflyApiClient['getTags']>) {
    return getFireflyApi().getTags(...args);
  },
  getAllTags() {
    return getFireflyApi().getAllTags();
  },
  getAccounts(...args: Parameters<FireflyApiClient['getAccounts']>) {
    return getFireflyApi().getAccounts(...args);
  },
  getAllAccounts(...args: Parameters<FireflyApiClient['getAllAccounts']>) {
    return getFireflyApi().getAllAccounts(...args);
  },
  getSubscriptions(...args: Parameters<FireflyApiClient['getSubscriptions']>) {
    return getFireflyApi().getSubscriptions(...args);
  },
  getAllSubscriptions() {
    return getFireflyApi().getAllSubscriptions();
  },
  createSubscription(...args: Parameters<FireflyApiClient['createSubscription']>) {
    return getFireflyApi().createSubscription(...args);
  },
  getRuleGroups(...args: Parameters<FireflyApiClient['getRuleGroups']>) {
    return getFireflyApi().getRuleGroups(...args);
  },
  getAllRuleGroups() {
    return getFireflyApi().getAllRuleGroups();
  },
  createRuleGroup(...args: Parameters<FireflyApiClient['createRuleGroup']>) {
    return getFireflyApi().createRuleGroup(...args);
  },
  createRule(...args: Parameters<FireflyApiClient['createRule']>) {
    return getFireflyApi().createRule(...args);
  },
  getRecurringTransactions(...args: Parameters<FireflyApiClient['getRecurringTransactions']>) {
    return getFireflyApi().getRecurringTransactions(...args);
  },
};
