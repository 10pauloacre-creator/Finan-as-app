import { AI_MODELS, AIModelId, AIProviderId, AITask, isOpenRouterProvider } from './aiModels';
import { getTaskProfile } from './taskProfiles';

export type ProviderAvailabilityStatus = 'not_configured' | 'unknown' | 'healthy' | 'degraded';

interface ProviderHealthState {
  available: boolean;
  lastCheckedAt: string;
  lastError?: string;
}

interface LastExecutionState {
  providerUsed?: AIProviderId;
  modelUsed?: string;
  task?: AITask;
  fallbackUsed: boolean;
  failedProvider?: AIProviderId;
  at?: string;
}

const providerHealth = new Map<AIProviderId, ProviderHealthState>();
let lastExecution: LastExecutionState = { fallbackUsed: false };

function parseFallbackOrder() {
  const raw = process.env.AI_FALLBACK_ORDER || 'openrouterFast,openrouterFree,openrouterReasoning,gemini,groq,deepseek,gemma4,anthropic';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is AIProviderId => item in AI_MODELS);
}

function getConfigHint(provider: AIProviderId) {
  if (isOpenRouterProvider(provider) && !process.env.OPENROUTER_API_KEY) {
    return 'Defina OPENROUTER_API_KEY para habilitar os modelos OpenRouter.';
  }

  if (provider === 'deepseek' && !process.env.DEEPSEEK_API_KEY) {
    return 'Defina DEEPSEEK_API_KEY para habilitar este provedor.';
  }

  if (provider === 'groq' && process.env.GROQ_API_KEY) {
    const key = process.env.GROQ_API_KEY;
    if ((key.match(/gsk_/g) || []).length > 1) {
      return 'A chave do Groq parece duplicada ou malformada. Gere uma nova chave em console.groq.com e salve apenas um valor.';
    }
  }

  if ((provider === 'gemma4' || provider === 'glmOcr') && process.env.HF_TOKEN) {
    return 'Use um HF_TOKEN com permissão para Inference Providers e billing habilitado no Hugging Face Router.';
  }

  return undefined;
}

function summarizeProviderError(error?: string) {
  if (!error) return undefined;

  if (error.includes('Quota exceeded') || error.includes('Too Many Requests')) {
    return 'Quota do provedor esgotada no momento.';
  }
  if (error.includes('credit balance is too low')) {
    return 'Saldo insuficiente na conta do provedor.';
  }
  if (error.includes('Invalid API Key')) {
    return 'Chave de API inválida.';
  }
  if (error.includes('sufficient permissions to call Inference Providers')) {
    return 'Token sem permissão para usar Inference Providers.';
  }
  if (error.includes('não configurada') || error.includes('nao configurada')) {
    return 'Credencial não configurada.';
  }

  return error.length > 180 ? `${error.slice(0, 177)}...` : error;
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
    const configured = Boolean(process.env[model.envKey]);
    const runtime = providerHealth.get(provider);
    const configHint = getConfigHint(provider);
    const summarizedError = summarizeProviderError(runtime?.lastError);
    const availability: ProviderAvailabilityStatus = !configured
      ? 'not_configured'
      : !runtime
      ? 'unknown'
      : runtime.available
      ? 'healthy'
      : 'degraded';

    return {
      id: provider,
      label: model.label,
      description: model.description,
      configured,
      available: runtime?.available ?? null,
      availability,
      statusLabel:
        availability === 'healthy'
          ? 'Disponível'
          : availability === 'degraded'
          ? 'Indisponível agora'
          : availability === 'unknown'
          ? 'Configurado, aguardando teste'
          : 'Não configurado',
      lastCheckedAt: runtime?.lastCheckedAt,
      lastError: summarizedError,
      configHint,
      model: process.env[model.modelEnv] || model.defaultModel,
      type: model.type || 'chat',
      fallbackOrder: parseFallbackOrder(),
      strengths: model.strengths,
      supportsVision: model.supportsVision,
      tier: model.tier,
    };
  });
}

export function getRecommendedProviders(task: AITask) {
  return getTaskProfile(task).preferredProviders;
}

function shouldAllowPremium(task: AITask, requestedProvider?: AIModelId, mode: 'auto' | 'manual' = 'auto') {
  if (task === 'analise_profunda') return true;
  if (mode === 'manual' && requestedProvider === 'openrouterPremium') return true;
  return false;
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

  const baseOrder = mode === 'manual' && manualProvider
    ? [manualProvider, ...recommended.filter((provider) => provider !== manualProvider)]
    : [...recommended];

  for (const provider of fallback) {
    if (!baseOrder.includes(provider)) {
      baseOrder.push(provider);
    }
  }

  const allowPremium = shouldAllowPremium(task, requestedProvider, mode);

  return baseOrder.filter((provider, index) => {
    if (!configured.includes(provider)) return false;
    if (baseOrder.indexOf(provider) !== index) return false;
    if (!allowPremium && provider === 'openrouterPremium') return false;
    return true;
  });
}

export function markProviderSuccess(provider: AIProviderId) {
  providerHealth.set(provider, {
    available: true,
    lastCheckedAt: new Date().toISOString(),
  });
}

export function markProviderFailure(provider: AIProviderId, error: string) {
  providerHealth.set(provider, {
    available: false,
    lastCheckedAt: new Date().toISOString(),
    lastError: error,
  });
}

export function setLastExecution(state: {
  providerUsed?: AIProviderId;
  modelUsed?: string;
  task?: AITask;
  fallbackUsed: boolean;
  failedProvider?: AIProviderId;
}) {
  lastExecution = {
    ...state,
    at: new Date().toISOString(),
  };
}

export function getLastExecution() {
  return lastExecution;
}
