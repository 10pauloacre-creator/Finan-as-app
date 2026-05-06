import { AIProviderId, AITask } from './aiModels';

export interface TaskProfile {
  preferredProviders: AIProviderId[];
  description: string;
  output: 'text' | 'json';
  multimodal?: 'image' | 'audio' | 'pdf';
}

export const TASK_PROFILES: Record<AITask, TaskProfile> = {
  categorizar_transacao: {
    preferredProviders: ['openrouterFast', 'openrouterFree', 'openrouterReasoning', 'groq', 'gemini'],
    description: 'Classificar transações com resposta curta em JSON.',
    output: 'json',
  },
  resumo_mensal: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'openrouterPremium', 'gemini', 'anthropic'],
    description: 'Gerar resumo mensal claro em português do Brasil.',
    output: 'json',
  },
  plano_economia: {
    preferredProviders: ['openrouterReasoning', 'openrouterPremium', 'openrouterFast', 'anthropic', 'gemini'],
    description: 'Montar um plano prático, prudente e conservador.',
    output: 'text',
  },
  detectar_gastos_incomuns: {
    preferredProviders: ['openrouterReasoning', 'openrouterFast', 'openrouterPremium', 'deepseek', 'gemini'],
    description: 'Encontrar anomalias sem inventar dados.',
    output: 'text',
  },
  responder_pergunta_financeira: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'openrouterPremium', 'gemini', 'anthropic'],
    description: 'Responder perguntas financeiras com base apenas no contexto recebido.',
    output: 'text',
  },
  explicar_grafico: {
    preferredProviders: ['openrouterReasoning', 'openrouterFast', 'openrouterPremium', 'gemini', 'deepseek'],
    description: 'Explicar um gráfico ou tendência financeira de forma clara.',
    output: 'text',
  },
  gerar_insights: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'openrouterFree', 'gemini', 'deepseek'],
    description: 'Gerar insights, recomendações e observações úteis em JSON.',
    output: 'json',
  },
  analisar_meta: {
    preferredProviders: ['openrouterReasoning', 'openrouterFast', 'openrouterPremium', 'anthropic', 'gemini'],
    description: 'Analisar metas financeiras e sugerir próximos passos.',
    output: 'text',
  },
  analise_profunda: {
    preferredProviders: ['openrouterPremium', 'openrouterReasoning', 'anthropic', 'deepseek'],
    description: 'Executar uma análise profunda, detalhada e mais custosa.',
    output: 'text',
  },
  estruturar_transacao_de_recibo: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'openrouterFree', 'gemini', 'deepseek'],
    description: 'Estruturar uma transação de recibo a partir do texto extraído por OCR.',
    output: 'json',
  },
  extrair_texto_imagem: {
    preferredProviders: ['glmOcr', 'gemma4', 'gemini'],
    description: 'Extrair texto bruto de imagens de recibos e comprovantes.',
    output: 'text',
    multimodal: 'image',
  },
  analisar_recibo_futuramente: {
    preferredProviders: ['glmOcr', 'gemma4', 'gemini'],
    description: 'Ler comprovantes e extrair dados financeiros.',
    output: 'text',
    multimodal: 'image',
  },
  analisar_imagem_financeira: {
    preferredProviders: ['glmOcr', 'gemma4', 'gemini'],
    description: 'Extrair transações de imagens financeiras.',
    output: 'text',
    multimodal: 'image',
  },
  analisar_audio_financeiro: {
    preferredProviders: ['gemini', 'gemma4', 'openrouterFast', 'openrouterReasoning'],
    description: 'Transcrever áudio e identificar transações financeiras.',
    output: 'json',
    multimodal: 'audio',
  },
  analisar_pdf_financeiro: {
    preferredProviders: ['gemini', 'gemma4', 'openrouterFast', 'openrouterReasoning'],
    description: 'Ler PDFs financeiros e extrair lançamentos.',
    output: 'json',
    multimodal: 'pdf',
  },
  agente_financeiro: {
    preferredProviders: ['openrouterReasoning', 'openrouterFast', 'openrouterPremium', 'gemini', 'anthropic'],
    description: 'Análise de agentes especializados com saída em JSON.',
    output: 'json',
  },
};

export function getTaskProfile(task: AITask) {
  return TASK_PROFILES[task];
}
