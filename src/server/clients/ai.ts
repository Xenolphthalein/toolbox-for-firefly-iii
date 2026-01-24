import OpenAI from 'openai';
import { config, isAIConfigured } from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AIClient');

let aiClient: OpenAI | null = null;

// Timeout for AI requests (5 minutes for cold starts with Ollama)
const AI_TIMEOUT_MS = 300000;

export function getAIClient(): OpenAI {
  if (!isAIConfigured()) {
    throw new Error('AI is not configured. Please configure OpenAI or Ollama in settings.');
  }

  if (!aiClient) {
    aiClient = createAIClient();
  }

  return aiClient;
}

function createAIClient(): OpenAI {
  const provider = config.ai.provider;

  if (provider === 'ollama') {
    logger.info(`Creating Ollama client: ${config.ai.apiUrl}/v1 (model: ${config.ai.model})`);
    // Ollama uses OpenAI-compatible API
    return new OpenAI({
      baseURL: `${config.ai.apiUrl}/v1`,
      apiKey: 'ollama', // Ollama doesn't require an API key but the SDK requires one
      timeout: AI_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  if (provider === 'openai') {
    logger.info(`Creating OpenAI client (model: ${config.ai.model})`);
    return new OpenAI({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.apiUrl || undefined,
      timeout: AI_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}

export function reinitializeAIClient(): void {
  aiClient = null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json';
  }
): Promise<string> {
  const client = getAIClient();
  const model = config.ai.model;
  const isOllama = config.ai.provider === 'ollama';

  // Ollama may not support response_format for all models
  // For JSON responses with Ollama, we'll instruct in the prompt instead
  const useJsonFormat = options?.responseFormat === 'json' && !isOllama;

  // For Ollama JSON responses, append instruction to the last user message
  const processedMessages = [...messages];
  if (options?.responseFormat === 'json' && isOllama) {
    let lastUserIdx = -1;
    for (let i = processedMessages.length - 1; i >= 0; i--) {
      if (processedMessages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx >= 0) {
      processedMessages[lastUserIdx] = {
        ...processedMessages[lastUserIdx],
        content:
          processedMessages[lastUserIdx].content +
          '\n\nIMPORTANT: Respond ONLY with valid JSON, no additional text.',
      };
    }
  }

  const startTime = Date.now();
  logger.debug(`AI request started (${config.ai.provider}/${model})`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: processedMessages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 1000,
      ...(useJsonFormat ? { response_format: { type: 'json_object' } } : {}),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.debug(`AI response received in ${elapsed}s`);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    return content;
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.error(
      `AI request failed after ${elapsed}s: ${error instanceof Error ? error.message : error}`
    );
    throw error;
  }
}

export async function analyzeForCategory(
  transactionDescription: string,
  amount: string,
  type: string,
  availableCategories: string[]
): Promise<{ categoryName: string; confidence: number; reasoning: string }> {
  // Normalize amount to standard decimal format for AI
  // Firefly stores amounts as decimal strings like "729.00"
  const numericAmount = parseFloat(amount);
  const formattedAmount = isNaN(numericAmount) ? amount : numericAmount.toFixed(2);

  const systemPrompt = `You are a financial categorization assistant. Your task is to suggest the most appropriate category for a transaction based on its description, amount, and type.

Available categories: ${availableCategories.join(', ')}

Respond in JSON format with the following structure:
{
  "categoryName": "string (must be one of the available categories)",
  "confidence": number (0-1, how confident you are in this suggestion),
  "reasoning": "string (brief explanation of why this category fits)"
}

If no category seems appropriate, use the category that best fits or suggest "Uncategorized" with low confidence.`;

  const userPrompt = `Transaction details:
- Description: ${transactionDescription}
- Amount: ${formattedAmount}
- Type: ${type}

Please suggest the most appropriate category.`;

  const response = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { responseFormat: 'json', temperature: 0.2 }
  );

  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch {
    throw new Error('Failed to parse AI category response');
  }
}

export async function analyzeForTags(
  transactionDescription: string,
  amount: string,
  type: string,
  existingTags: string[],
  availableTags: string[]
): Promise<Array<{ tagName: string; confidence: number; reasoning: string }>> {
  // Normalize amount to standard decimal format for AI
  const numericAmount = parseFloat(amount);
  const formattedAmount = isNaN(numericAmount) ? amount : numericAmount.toFixed(2);

  const systemPrompt = `You are a financial tagging assistant. Your task is to suggest appropriate tags for a transaction based on its description, amount, and type.

Available tags: ${availableTags.join(', ')}
Tags already on this transaction: ${existingTags.length > 0 ? existingTags.join(', ') : 'None'}

Respond in JSON format with the following structure:
{
  "suggestions": [
    {
      "tagName": "string (must be one of the available tags)",
      "confidence": number (0-1, how confident you are in this suggestion),
      "reasoning": "string (brief explanation of why this tag fits)"
    }
  ]
}

Rules:
- Only suggest tags that are relevant to the transaction
- Do not suggest tags that are already applied
- Return an empty array if no tags are appropriate
- Maximum 5 suggestions`;

  const userPrompt = `Transaction details:
- Description: ${transactionDescription}
- Amount: ${formattedAmount}
- Type: ${type}

Please suggest appropriate tags.`;

  const response = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { responseFormat: 'json', temperature: 0.2 }
  );

  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);
    return parsed.suggestions || [];
  } catch {
    throw new Error('Failed to parse AI tags response');
  }
}

// Test AI connection with a short timeout for status checks
const CONNECTION_TEST_TIMEOUT_MS = 10000; // 10 seconds for connection test

export async function testAIConnection(): Promise<{ success: boolean; message: string }> {
  try {
    if (!isAIConfigured()) {
      return { success: false, message: 'AI is not configured' };
    }

    const provider = config.ai.provider;
    const apiUrl = config.ai.apiUrl;

    // For Ollama, just check if the server is reachable (don't load the model)
    if (provider === 'ollama') {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${apiUrl}/api/tags`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          return { success: true, message: `Successfully connected to Ollama` };
        }
        return { success: false, message: `Ollama returned status ${response.status}` };
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          return { success: false, message: 'Ollama connection timed out' };
        }
        throw error;
      }
    }

    // For OpenAI, check the models endpoint (lightweight, doesn't invoke a model)
    if (provider === 'openai') {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${apiUrl || 'https://api.openai.com/v1'}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.ai.apiKey}`,
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          return { success: true, message: `Successfully connected to OpenAI` };
        }
        if (response.status === 401) {
          return { success: false, message: 'Invalid OpenAI API key' };
        }
        return { success: false, message: `OpenAI returned status ${response.status}` };
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          return { success: false, message: 'OpenAI connection timed out' };
        }
        throw error;
      }
    }

    return { success: false, message: `Unknown AI provider: ${provider}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `AI connection failed: ${message}` };
  }
}
