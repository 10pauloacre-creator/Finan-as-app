import { AIProviderId, AITask } from './aiModels';

export interface TaskProfile {
  preferredProviders: AIProviderId[];
  description: string;
  output: 'text' | 'json';
  multimodal?: 'image' | 'audio' | 'pdf';
}

export const TASK_PROFILES: Record<AITask, TaskProfile> = {
  categorizar_transacao: {
    preferredProviders: ['groq', 'gemini', 'deepseek', 'gemma4', 'anthropic'],
    description: 'Classificar transações com resposta curta em JSON.',
    output: 'json',
  },
  resumo_mensal: {
    preferredProviders: ['gemini', 'deepseek', 'anthropic', 'gemma4', 'groq'],
    description: 'Gerar resumo mensal claro em português do Brasil.',
    output: 'json',
  },
  plano_economia: {
    preferredProviders: ['anthropic', 'gemini', 'deepseek', 'gemma4', 'groq'],
    description: 'Montar um plano prático, prudente e conservador.',
    output: 'text',
  },
  detectar_gastos_incomuns: {
    preferredProviders: ['deepseek', 'gemini', 'anthropic', 'groq', 'gemma4'],
    description: 'Encontrar anomalias sem inventar dados.',
    output: 'text',
  },
  responder_pergunta_financeira: {
    preferredProviders: ['gemini', 'anthropic', 'deepseek', 'gemma4', 'groq'],
    description: 'Responder perguntas financeiras com base apenas no contexto recebido.',
    output: 'text',
  },
  explicar_grafico: {
    preferredProviders: ['gemini', 'gemma4', 'anthropic', 'deepseek', 'groq'],
    description: 'Explicar um gráfico ou tendência financeira de forma clara.',
    output: 'text',
  },
  gerar_insights: {
    preferredProviders: ['gemini', 'deepseek', 'gemma4', 'anthropic', 'groq'],
    description: 'Gerar insights, recomendações e observações úteis em JSON.',
    output: 'json',
  },
  analisar_meta: {
    preferredProviders: ['anthropic', 'gemini', 'deepseek', 'gemma4', 'groq'],
    description: 'Analisar metas financeiras e sugerir próximos passos.',
    output: 'text',
  },
  analisar_recibo_futuramente: {
    preferredProviders: ['gemma4', 'gemini', 'anthropic', 'deepseek', 'groq'],
    description: 'Ler comprovantes e extrair dados financeiros.',
    output: 'json',
    multimodal: 'image',
  },
  analisar_imagem_financeira: {
    preferredProviders: ['gemini', 'gemma4', 'anthropic', 'deepseek', 'groq'],
    description: 'Extrair transações de imagens financeiras.',
    output: 'json',
    multimodal: 'image',
  },
  analisar_audio_financeiro: {
    preferredProviders: ['gemini', 'gemma4', 'anthropic', 'deepseek', 'groq'],
    description: 'Transcrever áudio e identificar transações financeiras.',
    output: 'json',
    multimodal: 'audio',
  },
  analisar_pdf_financeiro: {
    preferredProviders: ['gemini', 'gemma4', 'anthropic', 'deepseek', 'groq'],
    description: 'Ler PDFs financeiros e extrair lançamentos.',
    output: 'json',
    multimodal: 'pdf',
  },
  agente_financeiro: {
    preferredProviders: ['gemini', 'anthropic', 'deepseek', 'gemma4', 'groq'],
    description: 'Análise de agentes especializados com saída em JSON.',
    output: 'json',
  },
};

export function getTaskProfile(task: AITask) {
  return TASK_PROFILES[task];
}
