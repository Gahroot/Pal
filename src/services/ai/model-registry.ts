import type { AIProvider, ModelInfo, ProviderConfig } from '../../types/index.js';

// ─── Provider Configs ─────────────────────────────────────────────────────────

export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  moonshot: {
    displayName: 'Moonshot',
    baseURL: 'https://api.moonshot.ai/v1/chat/completions',
    apiFormat: 'openai',
    authHeaderStyle: 'bearer',
    usesCustomThinkingParam: true,
  },
  xiaomi: {
    displayName: 'Xiaomi',
    baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1/chat/completions',
    apiFormat: 'openai',
    authHeaderStyle: 'bearer',
    usesCustomThinkingParam: false,
  },
  minimax: {
    displayName: 'MiniMax',
    baseURL: 'https://api.minimax.io/anthropic/v1/messages',
    apiFormat: 'anthropic',
    authHeaderStyle: 'x-api-key',
    usesCustomThinkingParam: true,
  },
  glm: {
    displayName: 'GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiFormat: 'openai',
    authHeaderStyle: 'bearer',
    usesCustomThinkingParam: false,
  },
};

// ─── Model Registry ───────────────────────────────────────────────────────────

export const MODEL_REGISTRY: ModelInfo[] = [
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'moonshot',
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'xiaomi-token-plan-sgp/mimo-v2-pro',
    name: 'MiMo-V2-Pro',
    provider: 'xiaomi',
    contextWindow: 1_048_576,
    maxOutputTokens: 32_000,
    supportsTools: true,
    supportsVision: false,
  },
  {
    id: 'MiniMax-M2.7',
    name: 'MiniMax M2.7',
    provider: 'minimax',
    contextWindow: 204_800,
    maxOutputTokens: 16_384,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'glm-4-plus',
    name: 'GLM-4-Plus',
    provider: 'glm',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    supportsTools: true,
    supportsVision: true,
  },
];

/** Returns models for a specific provider. */
export function modelsForProvider(provider: AIProvider): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider);
}

/** Returns the default model for a provider. */
export function defaultModel(provider: AIProvider): ModelInfo {
  const defaults: Record<AIProvider, string> = {
    moonshot: 'kimi-k2.5',
    xiaomi: 'xiaomi-token-plan-sgp/mimo-v2-pro',
    minimax: 'MiniMax-M2.7',
    glm: 'glm-4-plus',
  };
  const model = MODEL_REGISTRY.find((m) => m.id === defaults[provider]);
  if (!model) throw new Error(`No default model for provider: ${provider}`);
  return model;
}

/** Finds a model by ID. */
export function modelById(id: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/** Returns the provider config for a model. */
export function providerForModel(model: ModelInfo): ProviderConfig {
  return PROVIDER_CONFIGS[model.provider];
}
