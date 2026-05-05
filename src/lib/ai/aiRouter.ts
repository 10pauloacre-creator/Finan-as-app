import { AI_MODELS, AIModelId, AIProviderId, AITask } from './aiModels';
import { getTaskProfile } from './taskProfiles';

function parseFallbackOrder() {
  const raw = process.env.AI_FALLBACK_ORDER || 'gemini,groq,deepseek,gemma4,anthropic';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is AIProviderId => item in AI_MODELS);
}

export function getConfiguredProviders() {
  return (Object.keys(AI_MODELS) as AIProviderId[]).filter((provider) => Boolean(process.env[AI_MODELS[provider].envKey]));
}

export function getDefaultProviderMode() {
  return process.env.AI_DEFAULT_PROVIDER === 'manual' ? 'manual' : 'auto';
}

export function getProviderStatus() {
  return (Object.keys(AI_MODELS) as AIProviderId[]).map((provider) => {
    const model = AI_MODELS[provider];
    return {
      id: provider,
      label: model.label,
      description: model.description,
      configured: Boolean(process.env[model.envKey]),
      model: process.env[model.modelEnv] || model.defaultModel,
      fallbackOrder: parseFallbackOrder(),
      strengths: model.strengths,
      supportsVision: model.supportsVision,
    };
  });
}

export function getRecommendedProviders(task: AITask) {
  return getTaskProfile(task).preferredProviders;
}

export function resolveProviderOrder(task: AITask, requestedProvider?: AIModelId, mode: 'auto' | 'manual' = 'auto') {
  const recommended = getRecommendedProviders(task);
  const fallback = parseFallbackOrder();
  const configured = getConfiguredProviders();
  const defaultProvider = process.env.AI_DEFAULT_PROVIDER;
  const manualProvider =
    requestedProvider && requestedProvider !== 'automatico'
      ? requestedProvider
      : defaultProvider && defaultProvider !== 'auto' && defaultProvider in AI_MODELS
      ? (defaultProvider as AIProviderId)
      : undefined;

  let baseOrder = mode === 'manual' && manualProvider
    ? [manualProvider, ...recommended.filter((provider) => provider !== manualProvider)]
    : recommended;

  for (const provider of fallback) {
    if (!baseOrder.includes(provider)) {
      baseOrder.push(provider);
    }
  }

  return baseOrder.filter((provider, index) => configured.includes(provider) && baseOrder.indexOf(provider) === index);
}
