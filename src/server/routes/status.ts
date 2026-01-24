import { Router, Request, Response } from 'express';
import {
  config,
  isFireflyConfigured,
  isOpenAIConfigured,
  isAIConfigured,
  isFinTSConfigured,
  validateConfig,
} from '../config/index.js';
import { fireflyApi } from '../clients/firefly.js';
import { testAIConnection } from '../clients/ai.js';
import { getStoreStats } from '../services/index.js';
import type { ToolStatus, ApiResponse } from '../../shared/types/app.js';

const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sessionStores: getStoreStats(),
  });
});

// Get configuration status with readiness checks
router.get('/status', async (_req: Request, res: Response) => {
  const validation = validateConfig();

  // Test Firefly connection
  let fireflyConnection = { success: false, message: 'Not configured' };
  if (isFireflyConfigured()) {
    fireflyConnection = await fireflyApi.testConnection();
  }

  // Test AI connection (only if configured)
  let aiConnection = { success: false, message: 'Not configured' };
  if (isAIConfigured()) {
    aiConnection = await testAIConnection();
  }

  // Collect configuration gaps (things that could be configured but aren't)
  const configurationGaps: string[] = [];
  if (!isAIConfigured()) {
    configurationGaps.push('AI provider not configured - AI features disabled');
  }
  if (!isFinTSConfigured()) {
    configurationGaps.push('FinTS product ID not configured - FinTS import disabled');
  }
  if (config.auth.method === 'none') {
    configurationGaps.push('Authentication disabled - anyone with network access can use this app');
  }

  const response: ApiResponse<{
    configured: boolean;
    fireflyConnected: boolean;
    fireflyUrl: string;
    openaiConfigured: boolean;
    aiConfigured: boolean;
    aiConnected: boolean;
    aiProvider: string;
    aiModel: string;
    aiApiUrl: string;
    fintsConfigured: boolean;
    authMethod: string;
    appUrl: string;
    corsOrigins: string[];
    errors: string[];
    configurationGaps: string[];
  }> = {
    success: true,
    data: {
      configured: validation.valid,
      fireflyConnected: fireflyConnection.success,
      fireflyUrl: config.firefly.apiUrl,
      openaiConfigured: isOpenAIConfigured(),
      aiConfigured: isAIConfigured(),
      aiConnected: aiConnection.success,
      aiProvider: config.ai.provider,
      aiModel: config.ai.model,
      aiApiUrl: config.ai.apiUrl,
      fintsConfigured: isFinTSConfigured(),
      authMethod: config.auth.method,
      appUrl: config.appUrl,
      corsOrigins: config.corsOrigins,
      errors: [
        ...validation.errors,
        ...(fireflyConnection.success ? [] : [fireflyConnection.message]),
        ...(isAIConfigured() && !aiConnection.success ? [aiConnection.message] : []),
      ],
      configurationGaps,
    },
  };

  res.json(response);
});

// Get available tools
router.get('/tools', (_req: Request, res: Response) => {
  const tools: ToolStatus[] = [
    {
      name: 'duplicateFinder',
      available: isFireflyConfigured(),
      requiresConfig: ['FIREFLY_API_URL', 'FIREFLY_API_TOKEN'],
      description: 'Find and manage duplicate transactions',
    },
    {
      name: 'subscriptionFinder',
      available: isFireflyConfigured(),
      requiresConfig: ['FIREFLY_API_URL', 'FIREFLY_API_TOKEN'],
      description: 'Detect recurring transaction patterns',
    },
    {
      name: 'aiCategorySuggestions',
      available: isFireflyConfigured() && isAIConfigured(),
      requiresConfig: ['FIREFLY_API_URL', 'FIREFLY_API_TOKEN', 'AI_PROVIDER'],
      description: 'AI-powered category suggestions for uncategorized transactions',
    },
    {
      name: 'aiTagSuggestions',
      available: isFireflyConfigured() && isAIConfigured(),
      requiresConfig: ['FIREFLY_API_URL', 'FIREFLY_API_TOKEN', 'AI_PROVIDER'],
      description: 'AI-powered tag suggestions for transactions',
    },
    {
      name: 'amazonExtender',
      available: isFireflyConfigured(),
      requiresConfig: ['FIREFLY_API_URL', 'FIREFLY_API_TOKEN'],
      description: 'Extend Amazon order descriptions with item details',
    },
    {
      name: 'paypalExtender',
      available: isFireflyConfigured(),
      requiresConfig: ['FIREFLY_API_URL', 'FIREFLY_API_TOKEN'],
      description: 'Extend PayPal transaction descriptions with payment details',
    },
    {
      name: 'bankConverter',
      available: true, // Always available - runs client-side, Firefly only needed for direct import
      requiresConfig: [],
      description: 'Convert bank export CSV files to Firefly III import format',
    },
    {
      name: 'fintsImporter',
      available: isFireflyConfigured() && isFinTSConfigured(),
      requiresConfig: ['FIREFLY_API_URL', 'FIREFLY_API_TOKEN', 'FINTS_PRODUCT_ID'],
      description: 'Import transactions directly from German banks via FinTS/HBCI',
    },
  ];

  res.json({ success: true, data: tools });
});

export default router;
