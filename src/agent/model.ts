/**
 * Chapter 5 - Model Resolution
 *
 * Maps MyClaw's ProviderConfig to pi-ai's Model<Api> objects.
 * This bridges our YAML config format with pi-mono's model system.
 */

import type { Api, Model } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ProviderConfig } from "../config/index.js";
import { resolveSecret } from "../config/index.js";

/**
 * Map MyClaw provider type to pi-ai Api type
 */
function resolveApiType(providerType: string): Api {
  switch (providerType) {
    case "anthropic":
      return "anthropic-messages";
    case "openai":
      return "openai-completions";
    case "openrouter":
      return "openai-completions";
    default:
      return "openai-completions";
  }
}

/**
 * Map MyClaw provider type to pi-ai provider id
 */
function resolveProviderId(providerType: string): string {
  switch (providerType) {
    case "anthropic":
      return "anthropic";
    case "openai":
      return "openai";
    case "openrouter":
      return "openrouter";
    default:
      return providerType;
  }
}

/**
 * Create an AuthStorage with API keys from MyClaw's provider config.
 */
export function createAuthStorage(providers: ProviderConfig[]): AuthStorage {
  const authStorage = AuthStorage.inMemory();

  for (const provider of providers) {
    const apiKey = resolveSecret(provider.apiKey, provider.apiKeyEnv);
    if (apiKey) {
      const providerId = resolveProviderId(provider.type);
      authStorage.setRuntimeApiKey(providerId, apiKey);
    }
  }

  return authStorage;
}

/**
 * Create a ModelRegistry backed by the given AuthStorage.
 */
export function createModelRegistry(authStorage: AuthStorage): ModelRegistry {
  return new ModelRegistry(authStorage);
}

/**
 * Resolve a MyClaw ProviderConfig into a pi-ai Model<Api>.
 *
 * First tries the ModelRegistry (which includes pi-ai's built-in model catalog).
 * Falls back to constructing a Model manually from config values.
 */
export function resolveModel(
  providerConfig: ProviderConfig,
  modelRegistry: ModelRegistry,
  modelOverride?: string,
): Model<Api> {
  const modelId = modelOverride ?? providerConfig.model;
  const providerId = resolveProviderId(providerConfig.type);

  // Try the registry first (covers well-known models from pi-ai's catalog)
  const registered = modelRegistry.find(providerId, modelId);
  if (registered) {
    // Apply config overrides
    return {
      ...registered,
      baseUrl: providerConfig.baseUrl ?? registered.baseUrl,
      maxTokens: providerConfig.maxTokens ?? registered.maxTokens,
    } as Model<Api>;
  }

  // Fallback: construct a Model manually
  const baseUrl =
    providerConfig.baseUrl ??
    (providerConfig.type === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : undefined);

  return {
    id: modelId,
    name: modelId,
    api: resolveApiType(providerConfig.type),
    provider: providerId,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: providerConfig.maxTokens ?? 4096,
  } as Model<Api>;
}
