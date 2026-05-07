export type AIProviderId =
  | 'openrouterFree'
  | 'openrouterFast'
  | 'openrouterReasoning'
  | 'openrouterPremium'
  | 'gemini'
  | 'anthropic'
  | 'groq'
  | 'deepseek'
  | 'gemma4'
  | 'glmOcr';

export type AIModelId = 'automatico' | AIProviderId;
export type AIMode = 'auto' | 'manual';
export type AITask =
  | 'categorizar_transacao'
  | 'resumo_mensal'
  | 'plano_economia'
  | 'detectar_gastos_incomuns'
  | 'responder_pergunta_financeira'
  | 'explicar_grafico'
  | 'gerar_insights'
  | 'analisar_meta'
  | 'analise_profunda'
  | 'estruturar_transacao_de_recibo'
  | 'extrair_texto_imagem'
  | 'analisar_recibo_futuramente'
  | 'analisar_imagem_financeira'
  | 'analisar_audio_financeiro'
  | 'analisar_pdf_financeiro'
  | 'agente_financeiro'
  | 'estruturar_lista_compra_cartao'
  | 'automacao_financeira_interna';

export interface AIModelDefinition {
  id: AIProviderId;
  label: string;
  provider: string;
  envKey: string;
  modelEnv: string;
  defaultModel: string;
  type?: 'chat' | 'ocr';
  strengths: string[];
  supportsVision: boolean;
  supportsChat?: boolean;
  supportsAudio?: boolean;
  supportsPdf?: boolean;
  recommendedFor?: string[];
  description: string;
  tier?: 'free' | 'fast' | 'reasoning' | 'premium' | 'fallback' | 'ocr';
}

export const AI_MODELS: Record<AIProviderId, AIModelDefinition> = {
  openrouterFree: {
    id: 'openrouterFree',
    label: 'OpenRouter Free',
    provider: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_FREE_MODEL',
    defaultModel: 'openrouter/free',
    strengths: ['baixo_custo', 'fallback', 'texto'],
    supportsVision: false,
    supportsChat: true,
    description: 'Modelo gratuito para fallback economico via OpenRouter.',
    tier: 'free',
  },
  openrouterFast: {
    id: 'openrouterFast',
    label: 'OpenRouter Fast',
    provider: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_FAST_MODEL',
    defaultModel: 'google/gemini-2.5-flash',
    strengths: ['rapidez', 'chat', 'economico', 'resumo', 'visao'],
    supportsVision: true,
    supportsChat: true,
    supportsAudio: true,
    supportsPdf: true,
    description: 'Modelo rapido e economico, padrao para uso diario.',
    tier: 'fast',
  },
  openrouterReasoning: {
    id: 'openrouterReasoning',
    label: 'OpenRouter Reasoning',
    provider: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_REASONING_MODEL',
    defaultModel: 'deepseek/deepseek-chat',
    strengths: ['raciocinio', 'analise', 'plano'],
    supportsVision: true,
    supportsChat: true,
    supportsAudio: true,
    supportsPdf: true,
    description: 'Modelo de raciocinio para analises e planejamento mais cuidadoso.',
    tier: 'reasoning',
  },
  openrouterPremium: {
    id: 'openrouterPremium',
    label: 'OpenRouter Premium',
    provider: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_PREMIUM_MODEL',
    defaultModel: 'anthropic/claude-sonnet-4.5',
    strengths: ['profundo', 'premium', 'analise'],
    supportsVision: true,
    supportsChat: true,
    supportsAudio: true,
    supportsPdf: true,
    description: 'Modelo premium reservado para analise profunda ou selecao manual.',
    tier: 'premium',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    provider: 'gemini',
    envKey: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.0-flash',
    strengths: ['geral', 'resumo', 'classificacao', 'baixo_custo', 'multimodal'],
    supportsVision: true,
    supportsChat: true,
    supportsAudio: true,
    supportsPdf: true,
    description: 'Fallback multimodal legado para imagem, audio e PDF.',
    tier: 'fallback',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Claude / Anthropic',
    provider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    modelEnv: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-4-20250514',
    strengths: ['analise', 'texto_longo', 'raciocinio'],
    supportsVision: false,
    supportsChat: true,
    description: 'Fallback legado para analises textuais.',
    tier: 'fallback',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    provider: 'groq',
    envKey: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'llama-3.1-8b-instant',
    strengths: ['rapidez', 'chat', 'classificacao'],
    supportsVision: false,
    supportsChat: true,
    description: 'Fallback legado muito rapido para chat e classificacao.',
    tier: 'fallback',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'deepseek',
    envKey: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
    strengths: ['raciocinio', 'analise', 'codigo'],
    supportsVision: false,
    supportsChat: true,
    description: 'Fallback legado para raciocinio e analise estruturada.',
    tier: 'fallback',
  },
  gemma4: {
    id: 'gemma4',
    label: 'Gemma 4',
    provider: 'huggingface',
    envKey: 'HF_TOKEN',
    modelEnv: 'GEMMA4_MODEL',
    defaultModel: 'google/gemma-4-26B-A4B-it:novita',
    strengths: ['multimodal', 'texto', 'analise'],
    supportsVision: true,
    supportsChat: true,
    description: 'Fallback textual via Hugging Face Router.',
    tier: 'fallback',
  },
  glmOcr: {
    id: 'glmOcr',
    label: 'GLM OCR',
    provider: 'huggingface-ocr',
    envKey: 'HF_TOKEN',
    modelEnv: 'GLM_OCR_MODEL',
    defaultModel: 'zai-org/GLM-OCR',
    type: 'ocr',
    strengths: ['ocr', 'documentos', 'recibos', 'comprovantes', 'imagem_para_texto'],
    supportsVision: true,
    supportsChat: false,
    recommendedFor: ['analisar_recibo', 'extrair_texto_imagem', 'ler_comprovante'],
    description: 'OCR especializado para recibos, comprovantes e notas fiscais.',
    tier: 'ocr',
  },
};

export const AI_MODEL_OPTIONS: Array<{ id: AIModelId; label: string; description: string }> = [
  {
    id: 'automatico',
    label: 'Automatico recomendado',
    description: 'Modo economico: prioriza OpenRouter Fast e usa fallback automatico.',
  },
  ...Object.values(AI_MODELS)
    .filter((model) => model.type !== 'ocr')
    .map((model) => ({
      id: model.id,
      label: model.label,
      description: model.description,
    })),
];

export const OCR_MODEL_OPTIONS: Array<{ id: AIModelId; label: string; description: string }> = [
  {
    id: 'automatico',
    label: 'Automatico recomendado',
    description: 'O app prioriza OpenRouter Vision e usa fallback visual quando necessario.',
  },
  {
    id: 'openrouterFast',
    label: 'OpenRouter Vision',
    description: 'Leitura visual principal de recibos, comprovantes e imagens financeiras.',
  },
  {
    id: 'glmOcr',
    label: 'GLM OCR',
    description: 'Especialista em OCR de recibos, notas e comprovantes.',
  },
  {
    id: 'gemma4',
    label: 'Gemma 4 Vision',
    description: 'Alternativa visual via Hugging Face quando OCR precisar de fallback.',
  },
  {
    id: 'gemini',
    label: 'Gemini Vision',
    description: 'Fallback visual legado para leitura de imagens financeiras.',
  },
];

export function getModelEnvName(provider: AIProviderId) {
  return AI_MODELS[provider].modelEnv;
}

export function getModelName(provider: AIProviderId) {
  const definition = AI_MODELS[provider];
  return process.env[definition.modelEnv] || definition.defaultModel;
}

export function isProviderConfigured(provider: AIProviderId) {
  const definition = AI_MODELS[provider];
  return Boolean(process.env[definition.envKey]);
}

export function isOpenRouterProvider(provider: AIProviderId) {
  return AI_MODELS[provider].provider === 'openrouter';
}
