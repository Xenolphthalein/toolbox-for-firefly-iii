import { computed, type ComputedRef } from 'vue';
import { useAppStore } from '../stores/app';

/**
 * UI metadata for a tool (static, frontend-only)
 */
export interface ToolUIConfig {
  /** Unique identifier matching backend tool name */
  id: string;
  /** Display name for the tool */
  title: string;
  /** Short description for navigation/sidebar */
  subtitle: string;
  /** Long description for dashboard cards */
  description: string;
  /** Material Design icon name */
  icon: string;
  /** Color theme for the tool card */
  color: string;
  /** Vue Router route path */
  route: string;
  /** Whether this tool requires AI configuration */
  requiresAI: boolean;
}

/**
 * Tool with computed disabled state based on backend status
 */
export interface ToolWithStatus extends ToolUIConfig {
  /** Whether the tool is currently disabled (from backend) */
  disabled: boolean;
  /** Reason why the tool is disabled (if applicable) */
  disabledReason: string;
}

/**
 * Frontend UI configuration for tools - maps backend tool names to UI metadata
 */
export const TOOL_UI_CONFIG: Record<string, ToolUIConfig> = {
  duplicateFinder: {
    id: 'duplicateFinder',
    title: 'Duplicate Finder',
    subtitle: 'Find duplicates',
    description: 'Scan your transactions for potential duplicates and manage them easily.',
    icon: 'mdi-content-copy',
    color: 'blue',
    route: '/duplicates',
    requiresAI: false,
  },
  subscriptionFinder: {
    id: 'subscriptionFinder',
    title: 'Subscription Finder',
    subtitle: 'Track recurring expenses',
    description: 'Detect recurring transaction patterns and create recurring transactions.',
    icon: 'mdi-credit-card-clock',
    color: 'purple',
    route: '/subscriptions',
    requiresAI: false,
  },
  aiCategorySuggestions: {
    id: 'aiCategorySuggestions',
    title: 'AI Category Suggestions',
    subtitle: 'Smart suggestions',
    description: 'Get smart category suggestions for uncategorized transactions using AI.',
    icon: 'mdi-shape',
    color: 'teal',
    route: '/categories',
    requiresAI: true,
  },
  aiTagSuggestions: {
    id: 'aiTagSuggestions',
    title: 'AI Tag Suggestions',
    subtitle: 'Tag suggestions',
    description: 'Receive intelligent tag recommendations based on transaction content.',
    icon: 'mdi-tag-multiple',
    color: 'orange',
    route: '/tags',
    requiresAI: true,
  },
  amazonExtender: {
    id: 'amazonExtender',
    title: 'Amazon Order Extender',
    subtitle: 'Order details',
    description: 'Match Amazon transactions with order details for better descriptions.',
    icon: 'mdi-package-variant',
    color: 'amber',
    route: '/amazon',
    requiresAI: false,
  },
  paypalExtender: {
    id: 'paypalExtender',
    title: 'PayPal Extender',
    subtitle: 'Payment details',
    description: 'Match PayPal transactions with activity report details for better descriptions.',
    icon: 'mdi-credit-card-outline',
    color: 'indigo',
    route: '/paypal',
    requiresAI: false,
  },
  bankConverter: {
    id: 'bankConverter',
    title: 'CSV Importer',
    subtitle: 'Import bank exports',
    description:
      'Convert and import bank CSV exports into Firefly III with column mapping and transformations.',
    icon: 'mdi-database-import',
    color: 'green',
    route: '/converter',
    requiresAI: false,
  },
  fintsImporter: {
    id: 'fintsImporter',
    title: 'FinTS Importer',
    subtitle: 'Direct bank import',
    description: 'Connect directly to your German bank via FinTS/HBCI to import transactions.',
    icon: 'mdi-bank-transfer',
    color: 'cyan',
    route: '/fints',
    requiresAI: false,
  },
};

/** Ordered list of tool IDs for consistent display order */
const TOOL_ORDER = [
  'duplicateFinder',
  'subscriptionFinder',
  'aiCategorySuggestions',
  'aiTagSuggestions',
  'amazonExtender',
  'paypalExtender',
  'bankConverter',
  'fintsImporter',
];

export interface UseToolsReturn {
  /** All tool UI configs (static) */
  configs: ToolUIConfig[];
  /** Tools with computed disabled status based on backend state */
  tools: ComputedRef<ToolWithStatus[]>;
  /** Only tools that are currently available (not disabled) */
  availableTools: ComputedRef<ToolWithStatus[]>;
  /** Get a specific tool UI config by ID */
  getToolConfig: (id: string) => ToolUIConfig | undefined;
}

/**
 * Composable for accessing tool definitions with availability from backend
 */
export function useTools(): UseToolsReturn {
  const appStore = useAppStore();

  const configs = TOOL_ORDER.map((id) => TOOL_UI_CONFIG[id]).filter(Boolean);

  const tools = computed<ToolWithStatus[]>(() => {
    return TOOL_ORDER.map((id) => {
      const uiConfig = TOOL_UI_CONFIG[id];
      if (!uiConfig) return null;

      // Find backend status for this tool
      const backendStatus = appStore.tools.find((t) => t.name === id);
      const available = backendStatus?.available ?? false;

      // Determine disabled reason from backend requiresConfig
      let disabledReason = '';
      if (!available && backendStatus?.requiresConfig) {
        if (backendStatus.requiresConfig.includes('FINTS_PRODUCT_ID')) {
          disabledReason = 'FinTS Product ID required';
        } else if (backendStatus.requiresConfig.includes('AI_PROVIDER')) {
          disabledReason = 'Configure AI first';
        } else if (backendStatus.requiresConfig.includes('FIREFLY_API_URL')) {
          disabledReason = 'Connect to FireflyIII first';
        }
      }

      return {
        ...uiConfig,
        disabled: !available,
        disabledReason,
      };
    }).filter((t): t is ToolWithStatus => t !== null);
  });

  const availableTools = computed(() => tools.value.filter((t) => !t.disabled));

  function getToolConfig(id: string): ToolUIConfig | undefined {
    return TOOL_UI_CONFIG[id];
  }

  return {
    configs,
    tools,
    availableTools,
    getToolConfig,
  };
}
