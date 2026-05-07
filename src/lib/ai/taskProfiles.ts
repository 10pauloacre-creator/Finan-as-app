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
    description: 'Classificar transacoes com resposta curta em JSON.',
    output: 'json',
  },
  resumo_mensal: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'openrouterPremium', 'gemini', 'anthropic'],
    description: 'Gerar resumo mensal claro em portugues do Brasil.',
    output: 'json',
  },
  plano_economia: {
    preferredProviders: ['openrouterReasoning', 'openrouterPremium', 'openrouterFast', 'anthropic', 'gemini'],
    description: 'Montar um plano pratico, prudente e conservador.',
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
    description: 'Explicar um grafico ou tendencia financeira de forma clara.',
    output: 'text',
  },
  gerar_insights: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'openrouterFree', 'gemini', 'deepseek'],
    description: 'Gerar insights, recomendacoes e observacoes uteis em JSON.',
    output: 'json',
  },
  analisar_meta: {
    preferredProviders: ['openrouterReasoning', 'openrouterFast', 'openrouterPremium', 'anthropic', 'gemini'],
    description: 'Analisar metas financeiras e sugerir proximos passos.',
    output: 'text',
  },
  analise_profunda: {
    preferredProviders: ['openrouterPremium', 'openrouterReasoning', 'anthropic', 'deepseek'],
    description: 'Executar uma analise profunda, detalhada e mais custosa.',
    output: 'text',
  },
  estruturar_transacao_de_recibo: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'openrouterFree', 'gemini', 'deepseek'],
    description: 'Estruturar uma transacao de recibo a partir do texto extraido.',
    output: 'json',
  },
  extrair_texto_imagem: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'glmOcr', 'gemma4', 'gemini'],
    description: 'Extrair texto bruto de imagens de recibos e comprovantes.',
    output: 'text',
    multimodal: 'image',
  },
  analisar_recibo_futuramente: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'glmOcr', 'gemma4', 'gemini'],
    description: 'Ler comprovantes e extrair dados financeiros.',
    output: 'text',
    multimodal: 'image',
  },
  analisar_imagem_financeira: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'glmOcr', 'gemma4', 'gemini'],
    description: 'Extrair transacoes de imagens financeiras.',
    output: 'text',
    multimodal: 'image',
  },
  analisar_audio_financeiro: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'gemini', 'gemma4'],
    description: 'Transcrever audio e identificar transacoes financeiras.',
    output: 'json',
    multimodal: 'audio',
  },
  analisar_pdf_financeiro: {
    preferredProviders: ['openrouterFast', 'openrouterReasoning', 'gemini', 'gemma4'],
    description: 'Ler PDFs financeiros e extrair lancamentos.',
    output: 'json',
    multimodal: 'pdf',
  },
  agente_financeiro: {
    preferredProviders: ['openrouterReasoning', 'openrouterFast', 'openrouterPremium', 'gemini', 'anthropic'],
    description: 'Analise de agentes especializados com saida em JSON.',
    output: 'json',
  },
  estruturar_lista_compra_cartao: {
    preferredProviders: ['openrouterReasoning', 'openrouterFast', 'openrouterPremium', 'gemini', 'anthropic'],
    description: 'Transformar lista textual de compras em lancamento de cartao com itens detalhados.',
    output: 'json',
  },
  automacao_financeira_interna: {
    preferredProviders: ['openrouterReasoning', 'openrouterFast', 'openrouterPremium', 'gemini', 'anthropic'],
    description: 'Cruzar dados do projeto para sugerir automacoes e acoes internas com seguranca.',
    output: 'json',
  },
};

export function getTaskProfile(task: AITask) {
  return TASK_PROFILES[task];
}
