export type AIProviderId = 'gemini' | 'anthropic' | 'groq' | 'deepseek' | 'gemma4' | 'glmOcr';
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
  | 'estruturar_transacao_de_recibo'
  | 'extrair_texto_imagem'
  | 'analisar_recibo_futuramente'
  | 'analisar_imagem_financeira'
  | 'analisar_audio_financeiro'
  | 'analisar_pdf_financeiro'
  | 'agente_financeiro';

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
}

export const AI_MODELS: Record<AIProviderId, AIModelDefinition> = {
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
    description: 'Boa opção geral e hoje é a principal IA multimodal do app.',
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
    description: 'Forte para análises mais cuidadosas e textos mais longos.',
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
    description: 'Muito rápida para chat e classificações objetivas.',
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
    description: 'Boa para raciocínio, análise e respostas mais estruturadas.',
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
    description: 'Modelo via Hugging Face Router, útil como alternativa forte de texto.',
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
  },
};

export const AI_MODEL_OPTIONS: Array<{ id: AIModelId; label: string; description: string }> = [
  {
    id: 'automatico',
    label: 'Automático recomendado',
    description: 'O app escolhe a melhor IA para a tarefa e tenta fallback automático.',
  },
  ...Object.values(AI_MODELS).map((model) => ({
    id: model.id,
    label: model.label,
    description: model.description,
  })),
];

export const OCR_MODEL_OPTIONS: Array<{ id: AIModelId; label: string; description: string }> = [
  {
    id: 'automatico',
    label: 'Automático recomendado',
    description: 'O app prioriza GLM OCR e usa fallback visual quando necessário.',
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
    description: 'Boa opção visual para leitura de imagens financeiras.',
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
