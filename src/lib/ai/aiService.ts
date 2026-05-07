import { AI_MODELS, AIModelId, AIProviderId, AITask } from './aiModels';
import { markProviderFailure, markProviderSuccess, resolveProviderOrder, setLastExecution } from './aiRouter';
import { sanitizeFinancialData } from './sanitizeFinancialData';
import { getTaskProfile } from './taskProfiles';
import { runAnthropicProvider } from './providers/anthropicProvider';
import { runDeepSeekProvider } from './providers/deepseekProvider';
import { runGeminiProvider } from './providers/geminiProvider';
import { extractTextFromImage as runGlmOcrProvider } from './providers/glmOcrProvider';
import { runGroqProvider } from './providers/groqProvider';
import { runHuggingFaceProvider } from './providers/huggingFaceProvider';
import { runOpenRouterProvider } from './providers/openRouterProvider';

interface AttachmentInput {
  mimeType: string;
  data: string;
  fileName?: string;
}

interface AnalyzeReceiptInput {
  file: File;
  ocrProvider?: AIModelId;
  financialProvider?: AIModelId;
  userId?: string;
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

export interface OCRResult {
  success: boolean;
  providerUsed?: AIProviderId;
  modelUsed?: string;
  fallbackUsed: boolean;
  failedProvider?: AIProviderId;
  text?: string;
  raw?: unknown;
  error?: string;
}

export interface ProviderDiagnostic {
  provider: AIProviderId;
  ok: boolean;
  message: string;
  model?: string;
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

const DEFAULT_MAX_TOKENS_BY_TASK: Record<AITask, number> = {
  categorizar_transacao: 150,
  resumo_mensal: 700,
  responder_pergunta_financeira: 800,
  detectar_gastos_incomuns: 900,
  plano_economia: 1200,
  analise_profunda: 1800,
  explicar_grafico: 900,
  gerar_insights: 700,
  analisar_meta: 900,
  estruturar_transacao_de_recibo: 700,
  extrair_texto_imagem: 900,
  analisar_recibo_futuramente: 900,
  analisar_imagem_financeira: 1200,
  analisar_audio_financeiro: 900,
  analisar_pdf_financeiro: 4000,
  agente_financeiro: 1024,
  estruturar_lista_compra_cartao: 1400,
  automacao_financeira_interna: 1400,
};

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
    case 'estruturar_transacao_de_recibo':
      return `Tarefa: estruturar transação a partir de texto OCR de recibo.\nDados:\n${sanitizedInput}`;
    case 'extrair_texto_imagem':
      return `Tarefa: extrair texto bruto de imagem.\nDados:\n${sanitizedInput}`;
    case 'analisar_recibo_futuramente':
    case 'analisar_imagem_financeira':
      return `Tarefa: analisar imagem financeira e responder em JSON.\nDados adicionais:\n${sanitizedInput}`;
    case 'analisar_audio_financeiro':
      return `Tarefa: transcrever áudio, identificar transações e responder em JSON.\nDados adicionais:\n${sanitizedInput}`;
    case 'analisar_pdf_financeiro':
      return `Tarefa: analisar PDF financeiro e responder em JSON.\nDados adicionais:\n${sanitizedInput}`;
    case 'agente_financeiro':
      return `Tarefa: agir como agente financeiro especializado e responder em JSON.\nDados:\n${sanitizedInput}`;
    case 'estruturar_lista_compra_cartao':
      return `Tarefa: estruturar lista textual de compras em um lancamento de cartao com itens detalhados.\nDados:\n${sanitizedInput}`;
    case 'automacao_financeira_interna':
      return `Tarefa: cruzar dados do projeto e sugerir automacoes internas em JSON.\nDados:\n${sanitizedInput}`;
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
  if (
    provider === 'openrouterFree' ||
    provider === 'openrouterFast' ||
    provider === 'openrouterReasoning' ||
    provider === 'openrouterPremium'
  ) {
    return runOpenRouterProvider({ providerId: provider, system, prompt, temperature, maxTokens, attachments });
  }

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

function buildProbeImageFile() {
  const pngBytes = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83,
    222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 29, 99, 248, 255, 255, 63,
    0, 5, 254, 2, 254, 167, 53, 129, 132, 0, 0, 0, 0, 73, 69, 78,
    68, 174, 66, 96, 130,
  ]);

  return new File([pngBytes], 'probe.png', { type: 'image/png' });
}

async function extractTextWithVisionFallback(
  provider: AIProviderId,
  file: File,
): Promise<{ provider: AIProviderId; model: string; content: string; raw: unknown }> {
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const prompt = [
    'Extraia o texto desta imagem com maxima fidelidade.',
    'Nao resuma, nao interprete e nao classifique.',
    'Preserve valores, datas e nomes como aparecerem.',
    'Responda apenas com o texto extraido em portugues do Brasil.',
  ].join('\n');

  if (
    provider === 'openrouterFree' ||
    provider === 'openrouterFast' ||
    provider === 'openrouterReasoning' ||
    provider === 'openrouterPremium'
  ) {
    return runOpenRouterProvider({
      providerId: provider,
      system: 'Voce e um leitor OCR preciso.',
      prompt,
      temperature: 0,
      maxTokens: 1800,
      attachments: [{ mimeType: file.type || 'image/jpeg', data: base64, fileName: file.name }],
    });
  }

  if (provider === 'glmOcr') {
    return runGlmOcrProvider({ image: await file.arrayBuffer(), providerId: 'glmOcr' });
  }

  if (provider === 'gemma4') {
    return runGlmOcrProvider({ image: await file.arrayBuffer(), providerId: 'gemma4' });
  }

  if (provider === 'gemini') {
    return runGeminiProvider({
      system: 'Voce e um leitor OCR preciso.',
      prompt,
      temperature: 0,
      maxTokens: 1800,
      attachments: [{ mimeType: file.type || 'image/jpeg', data: base64 }],
    });
  }

  throw new Error(`O provedor ${provider} nao esta habilitado para OCR de imagem.`);
}
export async function runOCR({
  file,
  provider = 'automatico',
}: {
  file: File;
  provider?: AIModelId;
}): Promise<OCRResult> {
  const order = resolveProviderOrder(
    'extrair_texto_imagem',
    provider,
    provider !== 'automatico' ? 'manual' : 'auto',
  );
  const errors: string[] = [];

  if (order.length === 0) {
    return {
      success: false,
      fallbackUsed: false,
      error: 'Nenhum leitor OCR configurado está disponível no momento.',
    };
  }

  for (let index = 0; index < order.length; index += 1) {
    const candidate = order[index];
    try {
      const result = await extractTextWithVisionFallback(candidate, file);
      console.info('[ai:ocr]', {
        providerUsed: result.provider,
        modelUsed: result.model,
        fallbackUsed: index > 0,
      });
      markProviderSuccess(result.provider);

      return {
        success: true,
        providerUsed: result.provider,
        modelUsed: result.model,
        fallbackUsed: index > 0,
        failedProvider: index > 0 ? order[0] : undefined,
        text: result.content,
        raw: result.raw,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      errors.push(`${candidate}: ${message}`);
      markProviderFailure(candidate, message);
    }
  }

  console.error('[ai:ocr:error]', { errors });
  return {
    success: false,
    fallbackUsed: order.length > 1,
    failedProvider: order[0],
    error: 'Não foi possível extrair o texto da imagem agora. Tente novamente em instantes.',
  };
}

export async function probeProvider(provider: AIProviderId): Promise<ProviderDiagnostic> {
  try {
    if (provider === 'glmOcr') {
      const result = await extractTextWithVisionFallback('glmOcr', buildProbeImageFile());
      markProviderSuccess(provider);
      return {
        provider,
        ok: true,
        model: result.model,
        message: 'Leitor OCR respondeu ao teste.',
      };
    }

    const result = await executeProvider(
      provider,
      'Você é um verificador técnico de conectividade.',
      'Responda apenas com OK.',
      0,
      16,
    );
    markProviderSuccess(provider);

    return {
      provider,
      ok: true,
      model: result.model,
      message: 'Provider respondeu ao teste.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    markProviderFailure(provider, message);

    return {
      provider,
      ok: false,
      message,
    };
  }
}

export async function diagnoseProviders() {
  const providers = Object.keys(AI_MODELS) as AIProviderId[];
  const diagnostics: ProviderDiagnostic[] = [];

  for (const provider of providers) {
    diagnostics.push(await probeProvider(provider));
  }

  return diagnostics;
}

export async function analisarRecibo({
  file,
  ocrProvider = 'automatico',
  financialProvider = 'automatico',
  userId,
}: AnalyzeReceiptInput) {
  const ocrResult = await runOCR({ file, provider: ocrProvider });
  if (!ocrResult.success || !ocrResult.text) {
    return {
      success: false,
      fallbackUsed: ocrResult.fallbackUsed,
      failedProvider: ocrResult.failedProvider,
      error: ocrResult.error || 'Não foi possível ler o recibo.',
    };
  }

  const structured = await runAI({
    task: 'estruturar_transacao_de_recibo',
    provider: financialProvider,
    mode: financialProvider !== 'automatico' ? 'manual' : 'auto',
    userId,
    options: { temperature: 0.2, maxTokens: 900 },
    input: {
      customPrompt: `Você recebeu um texto extraído por OCR de um recibo ou comprovante.
Extraia e retorne apenas JSON válido com este formato:
{
  "estabelecimento": "string | null",
  "valor_total": 0,
  "data": "YYYY-MM-DD | null",
  "horario": "HH:mm | null",
  "categoria_sugerida": "string | null",
  "forma_pagamento": "pix | debito | credito | dinheiro | transferencia | outro | null",
  "confianca": 0,
  "observacoes": "string curta",
  "itens_compra": [
    { "nome": "string", "valor": 0, "quantidade": 1, "unidade": "un | kg | l | null" }
  ]
}

Use apenas o texto abaixo. Se faltar dado, use null. Não invente valores.
Se for uma nota fiscal de mercado/feira com itens discriminados, extraia cada item em "itens_compra".
Quando houver itens detalhados de mantimentos, use "categoria_sugerida": "Feira de mantimentos".

Texto OCR:
${ocrResult.text}`,
    },
  });

  if (!structured.success || !structured.answer) {
    return {
      success: false,
      fallbackUsed: structured.fallbackUsed,
      failedProvider: structured.failedProvider,
      error: structured.error || 'Não foi possível estruturar a transação do recibo.',
    };
  }

  return {
    success: true,
    ocrProviderUsed: ocrResult.providerUsed,
    ocrModelUsed: ocrResult.modelUsed,
    providerUsed: structured.providerUsed,
    modelUsed: structured.modelUsed,
    fallbackUsed: structured.fallbackUsed || ocrResult.fallbackUsed,
    failedProvider: structured.failedProvider || ocrResult.failedProvider,
    answer: structured.answer,
    texto_extraido: ocrResult.text,
  };
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
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS_BY_TASK[task] ?? 800;
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
      markProviderSuccess(result.provider);
      setLastExecution({
        task,
        providerUsed: result.provider,
        modelUsed: result.model,
        fallbackUsed: index > 0,
        failedProvider: index > 0 ? order[0] : undefined,
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
      markProviderFailure(candidate, message);
      console.warn('[ai:fallback]', { task, provider: candidate, message });
    }
  }

  console.error('[ai:error]', { task, userId: userId || 'anon', errors });
  setLastExecution({
    task,
    fallbackUsed: order.length > 1,
    failedProvider: order[0],
  });

  return {
    success: false,
    fallbackUsed: order.length > 1,
    failedProvider: order[0],
    error: 'Não foi possível consultar a IA agora. Tente novamente em instantes.',
  };
}




