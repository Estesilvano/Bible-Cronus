import { ChatMessage, LLMProvider, ProviderConfig } from '../types/index.js';

export interface LLMRequestOptions {
  taskType?: 'fast' | 'coding' | 'reasoning' | 'general';
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class FreeLLMRouter {
  private providers: Map<LLMProvider, ProviderConfig> = new Map();
  private priorityList: LLMProvider[] = [
    'groq',
    'openrouter',
    'arena',
    'puter',
    'huggingface',
    '9router',
  ];

  constructor(customConfigs?: Partial<Record<LLMProvider, Partial<ProviderConfig>>>) {
    this.initDefaultProviders();
    if (customConfigs) {
      for (const [key, conf] of Object.entries(customConfigs)) {
        const id = key as LLMProvider;
        if (this.providers.has(id)) {
          this.providers.set(id, { ...this.providers.get(id)!, ...conf });
        }
      }
    }
  }

  private initDefaultProviders() {
    this.providers.set('groq', {
      id: 'groq',
      name: 'Groq (Free Tier / Llama 3 70B & 8B)',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile',
      isFree: true,
      rateLimitHits: 0,
      isAvailable: true,
    });

    this.providers.set('openrouter', {
      id: 'openrouter',
      name: 'OpenRouter (Free Models: meta-llama/llama-3.2-3b-instruct:free, mistralai/mistral-7b-instruct:free)',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
      isFree: true,
      rateLimitHits: 0,
      isAvailable: true,
    });

    this.providers.set('arena', {
      id: 'arena',
      name: 'LMSYS Chatbot Arena Free Bridge',
      baseUrl: 'https://chat.lmsys.org/api',
      defaultModel: 'arena-free-best',
      isFree: true,
      rateLimitHits: 0,
      isAvailable: true,
    });

    this.providers.set('puter', {
      id: 'puter',
      name: 'Puter.js Free Cloud AI Gateway',
      baseUrl: 'https://api.puter.com/drivers/call/ai/chat',
      defaultModel: 'claude-3-5-sonnet',
      isFree: true,
      rateLimitHits: 0,
      isAvailable: true,
    });

    this.providers.set('huggingface', {
      id: 'huggingface',
      name: 'Hugging Face Inference API (Free)',
      baseUrl: 'https://api-inference.huggingface.co/v1',
      defaultModel: 'meta-llama/Meta-Llama-3-8B-Instruct',
      isFree: true,
      rateLimitHits: 0,
      isAvailable: true,
    });

    this.providers.set('9router', {
      id: '9router',
      name: '9router Free Hub',
      baseUrl: 'https://api.9router.com/v1',
      defaultModel: 'free-chat',
      isFree: true,
      rateLimitHits: 0,
      isAvailable: true,
    });
  }

  public getProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  public setApiKey(provider: LLMProvider, key: string): void {
    const config = this.providers.get(provider);
    if (config) {
      config.apiKey = key;
      config.isAvailable = true;
      config.rateLimitHits = 0;
    }
  }

  public markRateLimited(provider: LLMProvider): void {
    const config = this.providers.get(provider);
    if (config) {
      config.rateLimitHits++;
      config.isAvailable = false;
      // Auto-retry reset availability after 60 seconds
      setTimeout(() => {
        config.isAvailable = true;
      }, 60000);
    }
  }

  /**
   * Intelligently selects the best free model for the task.
   */
  public selectBestProvider(taskType: 'fast' | 'coding' | 'reasoning' | 'general' = 'general'): LLMProvider {
    if (taskType === 'coding' || taskType === 'reasoning') {
      // Prioritize Arena, Groq 70b, or OpenRouter free
      const codingPref: LLMProvider[] = ['arena', 'groq', 'openrouter', 'puter', 'huggingface', '9router'];
      for (const p of codingPref) {
        if (this.providers.get(p)?.isAvailable) return p;
      }
    }

    // Default fast/general routing
    for (const p of this.priorityList) {
      if (this.providers.get(p)?.isAvailable) {
        return p;
      }
    }
    return 'groq'; // Fallback
  }

  public async completeChat(
    messages: ChatMessage[],
    options?: LLMRequestOptions
  ): Promise<{ text: string; providerUsed: LLMProvider; model: string }> {
    const taskType = options?.taskType || 'general';
    const attemptedProviders: LLMProvider[] = [];

    let currentProvider = this.selectBestProvider(taskType);

    while (attemptedProviders.length < this.priorityList.length) {
      if (attemptedProviders.includes(currentProvider)) {
        const next = this.priorityList.find((p) => !attemptedProviders.includes(p));
        if (!next) break;
        currentProvider = next;
      }

      attemptedProviders.push(currentProvider);
      const config = this.providers.get(currentProvider)!;

      try {
        if (options?.signal?.aborted) {
          throw new Error('Operation aborted by user');
        }

        const responseText = await this.executeProviderCall(config, messages, options);
        return {
          text: responseText,
          providerUsed: currentProvider,
          model: config.defaultModel,
        };
      } catch (err: any) {
        if (options?.signal?.aborted) {
          throw err;
        }
        // If error indicates rate limit or server error, mark and failover to next provider
        this.markRateLimited(currentProvider);
        // Continue loop to try next available provider
      }
    }

    throw new Error('All free LLM providers exhausted or failed. Please check network connection or verify API keys.');
  }

  /**
   * Dispatches request to the specific provider format.
   */
  private async executeProviderCall(
    config: ProviderConfig,
    messages: ChatMessage[],
    options?: LLMRequestOptions
  ): Promise<string> {
    if (config.id === 'puter') {
      // Puter driver format
      return this.callPuterAPI(config, messages, options);
    }

    // Standard OpenAI compatible endpoint (Groq, OpenRouter, 9router, HuggingFace OpenAI bridge, Arena bridge)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    if (config.id === 'openrouter') {
      headers['HTTP-Referer'] = 'https://opencode.android';
      headers['X-Title'] = 'OpenCode Agent';
    }

    const payload = {
      model: config.defaultModel,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
    };

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: options?.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Provider ${config.id} error (${res.status}): ${errBody}`);
    }

    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  private async callPuterAPI(
    config: ProviderConfig,
    messages: ChatMessage[],
    options?: LLMRequestOptions
  ): Promise<string> {
    const res = await fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        interface: 'puter-chat-completion',
        driver: 'chat',
        test_mode: false,
        method: 'complete',
        args: {
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          model: config.defaultModel,
        },
      }),
      signal: options?.signal,
    });

    if (!res.ok) {
      throw new Error(`Puter API error (${res.status})`);
    }

    const data: any = await res.json();
    return data?.result?.message?.content || data?.text || JSON.stringify(data);
  }
}
