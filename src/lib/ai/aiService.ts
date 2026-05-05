import { AIModelId, AIProviderId, AITask } from './aiModels';
import { resolveProviderOrder } from './aiRouter';
import { sanitizeFinancialData } from './sanitizeFinancialData';
import { getTaskProfile } from './taskProfiles';
import { runAnthropicProvider } from './providers/anthropicProvider';
import { runDeepSeekProvider } from './providers/deepseekProvider';
import { runGeminiProvider } from './providers/geminiProvider';
import { runGroqProvider } from './providers/groqProvider';
import { runHuggingFaceProvider } from './providers/huggingFaceProvider';

interface AttachmentInput {
  mimeType: string;
  data: string;
}

interface RunAIInput {
  task: AITask;
  input: Record<string, unknown>;
  provider?: AIModelId;
  mode?: 'auto' | 'manual';
  userId?: string;
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
  attachments?: AttachmentInput[];
}

export interface RunAIResult {
  success: boolean;
  providerUsed?: AIProviderId;
  modelUsed?: string;
  fallbackUsed: boolean;
  failedProvider?: AIProviderId;
  answer?: string;
  raw?: unknown;
  error?: string;
}

const FINANCIAL_SYSTEM_PROMPT = [
  'Você é um assistente financeiro pessoal dentro de um app de finanças.',
  'Use apenas os dados fornecidos.',
  'Não invente valores.',
  'Não peça CPF, senha, token, agência ou conta.',
  'Não dê garantia de investimento.',
  'Não recomende crédito abusivo.',
  'Seja claro, objetivo e prudente.',
  'Quando faltar informação, diga qual informação falta.',
  'Responda sempre em português do Brasil.',
].join('\n');

function buildPrompt(task: AITask, sanitizedInput: string) {
  try {
    const parsed = JSON.parse(sanitizedInput) as { customPrompt?: string };
    if (parsed?.customPrompt) {
      return parsed.customPrompt;
    }
  } catch {
    // ignore
  }

  switch (task) {
    case 'categorizar_transacao':
      return `Tarefa: categorizar transação.\nResponda em JSON curto.\nDados:\n${sanitizedInput}`;
    case 'resumo_mensal':
      return `Tarefa: gerar resumo mensal com resposta estruturada em JSON.\nDados:\n${sanitizedInput}`;
    case 'plano_economia':
      return `Tarefa: montar plano de economia prático, conservador e realista.\nDados:\n${sanitizedInput}`;
    case 'detectar_gastos_incomuns':
      return `Tarefa: detectar gastos incomuns e apontar anomalias sem inventar dados.\nDados:\n${sanitizedInput}`;
    case 'responder_pergunta_financeira':
      return `Tarefa: responder pergunta financeira com base apenas no contexto.\nDados:\n${sanitizedInput}`;
    case 'explicar_grafico':
      return `Tarefa: explicar gráfico ou tendência financeira em linguagem clara.\nDados:\n${sanitizedInput}`;
    case 'gerar_insights':
      return `Tarefa: gerar insights financeiros úteis em JSON.\nDados:\n${sanitizedInput}`;
    case 'analisar_meta':
      return `Tarefa: analisar meta financeira e sugerir próximos passos prudentes.\nDados:\n${sanitizedInput}`;
    case 'analisar_recibo_futuramente':
    case 'analisar_imagem_financeira':
      return `Tarefa: analisar imagem financeira e responder em JSON.\nDados adicionais:\n${sanitizedInput}`;
    case 'analisar_audio_financeiro':
      return `Tarefa: transcrever áudio, identificar transações e responder em JSON.\nDados adicionais:\n${sanitizedInput}`;
    case 'analisar_pdf_financeiro':
      return `Tarefa: analisar PDF financeiro e responder em JSON.\nDados adicionais:\n${sanitizedInput}`;
    case 'agente_financeiro':
      return `Tarefa: agir como agente financeiro especializado e responder em JSON.\nDados:\n${sanitizedInput}`;
    default:
      return sanitizedInput;
  }
}

async function executeProvider(
  provider: AIProviderId,
  system: string,
  prompt: string,
  temperature: number,
  maxTokens: number,
  attachments?: AttachmentInput[],
) {
  if (provider === 'gemini') {
    return runGeminiProvider({ system, prompt, temperature, maxTokens, attachments });
  }

  if (attachments?.length) {
    throw new Error(`O provedor ${provider} não suporta esta tarefa multimodal atualmente.`);
  }

  if (provider === 'anthropic') {
    return runAnthropicProvider({ system, prompt, temperature, maxTokens });
  }
  if (provider === 'groq') {
    return runGroqProvider({ system, prompt, temperature, maxTokens });
  }
  if (provider === 'deepseek') {
    return runDeepSeekProvider({ system, prompt, temperature, maxTokens });
  }

  return runHuggingFaceProvider({ system, prompt, temperature, maxTokens });
}

export async function runAI({
  task,
  input,
  provider = 'automatico',
  mode = 'auto',
  userId,
  options,
  attachments,
}: RunAIInput): Promise<RunAIResult> {
  const order = resolveProviderOrder(task, provider, mode);
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 800;
  const sanitizedInput = sanitizeFinancialData(input);
  const prompt = buildPrompt(task, sanitizedInput);
  const profile = getTaskProfile(task);
  const errors: string[] = [];

  if (order.length === 0) {
    return {
      success: false,
      fallbackUsed: false,
      error: 'Nenhuma IA configurada está disponível para esta tarefa.',
    };
  }

  for (let index = 0; index < order.length; index += 1) {
    const candidate = order[index];
    try {
      const result = await executeProvider(
        candidate,
        `${FINANCIAL_SYSTEM_PROMPT}\nPerfil da tarefa: ${profile.description}`,
        prompt,
        temperature,
        maxTokens,
        attachments,
      );

      console.info('[ai]', {
        task,
        userId: userId || 'anon',
        providerUsed: result.provider,
        modelUsed: result.model,
        fallbackUsed: index > 0,
      });

      return {
        success: true,
        providerUsed: result.provider,
        modelUsed: result.model,
        fallbackUsed: index > 0,
        failedProvider: index > 0 ? order[0] : undefined,
        answer: result.content,
        raw: result.raw,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      errors.push(`${candidate}: ${message}`);
      console.warn('[ai:fallback]', { task, provider: candidate, message });
    }
  }

  console.error('[ai:error]', { task, userId: userId || 'anon', errors });

  return {
    success: false,
    fallbackUsed: order.length > 1,
    failedProvider: order[0],
    error: 'Não foi possível consultar a IA agora. Tente novamente em instantes.',
  };
}
