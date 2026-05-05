import { getProviderStatus } from '@/lib/ai/aiRouter';
import { AIModelId, AITask } from '@/lib/ai/aiModels';
import { analisarRecibo, runAI } from '@/lib/ai/aiService';
import { sanitizeFinancialData } from '@/lib/ai/sanitizeFinancialData';
import { PALAVRAS_CHAVE_CATEGORIAS } from '@/lib/categorias-padrao';

const HOJE = () => new Date().toISOString().split('T')[0];

function jsonFromText(text: string) {
  const clean = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const objectMatch = clean.match(/\{[\s\S]*\}/);
  const arrayMatch = clean.match(/\[[\s\S]*\]/);
  const candidate = objectMatch?.[0] || arrayMatch?.[0];
  if (!candidate) return null;

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function buildTextTaskPayload(task: AITask, input: Record<string, unknown>) {
  const safeInput = sanitizeFinancialData(input);

  if (task === 'responder_pergunta_financeira') {
    return {
      customPrompt: [
        'Contexto financeiro resumido:',
        safeInput || 'Sem contexto adicional.',
        '',
        'Pergunta do usuário:',
        String(input.question || ''),
      ].join('\n'),
    };
  }

  if (task === 'resumo_mensal') {
    const mes = input.mes ? `Mês de referência: ${String(input.mes)}` : '';
    const ano = input.ano ? `Ano de referência: ${String(input.ano)}` : '';
    return {
      customPrompt: `Gere um relatório mensal em JSON no formato:
{
  "resumo": "parágrafo narrativo de 3-4 frases",
  "nota_mes": "ótimo" | "bom" | "regular" | "ruim",
  "destaques": [{ "tipo": "positivo" | "negativo" | "neutro", "titulo": "...", "descricao": "..." }],
  "recomendacoes": [{ "prioridade": "alta" | "media" | "baixa", "acao": "...", "motivo": "..." }],
  "previsao_proximo_mes": "frase curta"
}

Dados do mês:
${mes}
${ano}
${safeInput}

Responda apenas com JSON válido.`,
    };
  }

  if (task === 'gerar_insights') {
    return {
      customPrompt: `Analise os dados e retorne apenas um JSON válido no formato:
[
  {
    "tipo": "alerta" | "dica" | "conquista" | "previsao",
    "titulo": "título curto",
    "mensagem": "mensagem objetiva"
  }
]

Dados:
${safeInput}`,
    };
  }

  if (task === 'agente_financeiro') {
    const agente = String(input.agente || 'agente');
    const nome = String(input.nome || agente);
    const descricao = String(input.descricao || 'análise financeira especializada');
    return {
      customPrompt: `Atue como ${nome}, um agente financeiro especializado em ${descricao}, e retorne apenas JSON válido no formato:
{
  "insights": [
    { "tipo": "alerta" | "ok" | "tendencia" | "padrao" | "oportunidade" | "projecao" | "estrategia" | "meta", "titulo": "...", "mensagem": "...", "acao": "..." }
  ]
}

Dados:
${safeInput}`,
    };
  }

  if (task === 'categorizar_transacao') {
    return {
      customPrompt: `Classifique a transação e responda apenas em JSON:
{ "categoria": "...", "tipo": "despesa" | "receita" | "transferencia", "justificativa": "..." }

Dados:
${safeInput}`,
    };
  }

  if (task === 'plano_economia') {
    return {
      customPrompt: `Monte um plano de economia prático, conservador e viável com base apenas nestes dados:
${safeInput}

Responda em português do Brasil, de forma objetiva, sem inventar valores.`,
    };
  }

  if (task === 'detectar_gastos_incomuns') {
    return {
      customPrompt: `Analise os dados e aponte gastos fora do padrão, concentrações preocupantes ou anomalias sem inventar informações:
${safeInput}`,
    };
  }

  if (task === 'analisar_meta') {
    return {
      customPrompt: `Analise a meta financeira e responda com orientações prudentes e objetivas:
${safeInput}`,
    };
  }

  return {
    customPrompt: safeInput,
  };
}

function imagePrompt(legenda?: string | null) {
  return `Você é um extrator de dados financeiros de imagens.
${legenda ? `Contexto do usuário: "${legenda}"\n` : ''}
TRANSAÇÃO ÚNICA: responda SOMENTE com JSON:
{"modo":"unico","tipo":"despesa","valor":89.90,"descricao":"iFood - Pizza","categoria":"Delivery","data":"${HOJE()}","hora":"20:30","metodo_pagamento":"credito","parcelas":null,"local":"iFood","banco":null}

EXTRATO COM MÚLTIPLAS TRANSAÇÕES: responda SOMENTE com JSON:
{"modo":"lote","transacoes":[{"tipo":"despesa","valor":50,"descricao":"Mercado X","categoria":"Mercado","data":"${HOJE()}","hora":null,"metodo_pagamento":"debito","parcelas":null,"local":null,"banco":null}]}

NÃO IDENTIFICADO:
{"modo":"erro","erro":"motivo"}

Responda apenas com JSON válido.`;
}

function audioPrompt() {
  return `Analise um áudio em português do Brasil e retorne SOMENTE JSON.

Se houver transação financeira:
{"transcricao":"...","tipo":"despesa","valor":50.00,"descricao":"iFood pizza","categoria":"Delivery","data":"${HOJE()}","hora":null,"metodo_pagamento":"pix","parcelas":null,"local":null,"banco":null}

Se não houver transação:
{"transcricao":"...","erro":"sem transação identificada"}`;
}

function pdfPrompt() {
  return `Você é um extrator de faturas de cartão de crédito brasileiras.
Retorne SOMENTE um JSON válido:
{
  "bancaNome": "Nome do banco/cartão",
  "mesReferencia": "MM/YYYY",
  "transacoes": [
    {
      "tipo": "despesa",
      "valor": 89.90,
      "descricao": "IFOOD *RESTAURANTE",
      "categoria": "Delivery",
      "data": "${HOJE()}",
      "hora": null,
      "metodo_pagamento": "credito",
      "parcelas": null,
      "local": null,
      "banco": null
    }
  ]
}

Se não conseguir identificar a fatura:
{"erro":"não é uma fatura de cartão"}`;
}

function inferCategoryId(data: Record<string, unknown>) {
  const source = String(data.categoria_sugerida || data.categoria || data.descricao || '').toLowerCase();

  for (const [keyword, categoryId] of Object.entries(PALAVRAS_CHAVE_CATEGORIAS)) {
    if (source.includes(keyword)) return categoryId;
  }

  if (data.tipo === 'receita') return 'pix_recebido';
  if (data.metodo_pagamento === 'pix') return 'pix_enviado';
  return undefined;
}

async function handleJsonRequest(body: {
  task?: AITask;
  mode?: 'auto' | 'manual';
  provider?: AIModelId;
  input?: Record<string, unknown>;
  question?: string;
  financialContext?: unknown;
  aiModel?: AIModelId;
  action?: string;
}) {
  const legacyTask = body.task || (
    body.action === 'resumo_mensal' ? 'resumo_mensal' :
    body.action === 'categorizar_transacoes' ? 'categorizar_transacao' :
    body.action === 'plano_economia' ? 'plano_economia' :
    body.action === 'alerta_gastos' ? 'detectar_gastos_incomuns' :
    'responder_pergunta_financeira'
  );

  const input = body.input || {
    question: body.question,
    financialContext: body.financialContext,
    action: body.action,
  };

  const result = await runAI({
    task: legacyTask,
    input: buildTextTaskPayload(legacyTask, input),
    provider: body.provider || body.aiModel || 'automatico',
    mode: body.mode || ((body.provider || body.aiModel) && (body.provider || body.aiModel) !== 'automatico' ? 'manual' : 'auto'),
    options: { temperature: 0.3, maxTokens: 800 },
  });

  if (!result.success) {
    return Response.json({ success: false, error: result.error }, { status: 500 });
  }

  const parsed = jsonFromText(result.answer || '');

  if (legacyTask === 'agente_financeiro') {
    return Response.json({
      success: true,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      insights: (parsed as { insights?: unknown[] } | null)?.insights || [],
      answer: result.answer,
    });
  }

  if (legacyTask === 'resumo_mensal') {
    return Response.json({
      success: true,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      answer: result.answer,
      ...(typeof parsed === 'object' && parsed ? parsed as Record<string, unknown> : {}),
      resposta: result.answer,
    });
  }

  if (legacyTask === 'gerar_insights') {
    return Response.json({
      success: true,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      dicas: Array.isArray(parsed) ? parsed : [],
      answer: result.answer,
    });
  }

  return Response.json({
    success: true,
    providerUsed: result.providerUsed,
    modelUsed: result.modelUsed,
    fallbackUsed: result.fallbackUsed,
    failedProvider: result.failedProvider,
    answer: result.answer,
    resposta: result.answer,
  });
}

async function handleFormDataRequest(formData: FormData) {
  const task = String(formData.get('task') || '');
  const provider = String(formData.get('provider') || formData.get('aiModel') || 'automatico') as AIModelId;
  const mode = String(formData.get('mode') || (provider !== 'automatico' ? 'manual' : 'auto')) as 'auto' | 'manual';

  if (task === 'analisar_recibo_futuramente') {
    const foto = formData.get('foto') as File | null;
    if (!foto) return Response.json({ success: false, error: 'Nenhuma foto enviada.' }, { status: 400 });
    const result = await analisarRecibo({
      file: foto,
      ocrProvider: provider,
      financialProvider: String(formData.get('financialProvider') || 'automatico') as AIModelId,
    });
    if (!result.success) return Response.json({ success: false, error: result.error }, { status: 500 });
    const parsed = jsonFromText(result.answer || '') as Record<string, unknown> | null;
    return Response.json({
      success: true,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      ocrProviderUsed: result.ocrProviderUsed,
      ocrModelUsed: result.ocrModelUsed,
      dados: parsed ? { ...parsed, categoria_id: inferCategoryId(parsed) } : undefined,
      texto_extraido: result.texto_extraido,
      revisaoObrigatoria: true,
      texto_original: result.answer,
    });
  }

  if (task === 'analisar_imagem_financeira') {
    const imagem = formData.get('imagem') as File | null;
    const legenda = formData.get('legenda') as string | null;
    if (!imagem) return Response.json({ success: false, error: 'Imagem obrigatória.' }, { status: 400 });
    const result = await runAI({
      task: 'analisar_imagem_financeira',
      provider,
      mode,
      input: { customPrompt: imagePrompt(legenda) },
      attachments: [{ mimeType: imagem.type || 'image/jpeg', data: Buffer.from(await imagem.arrayBuffer()).toString('base64') }],
      options: { temperature: 0.1, maxTokens: 1200 },
    });
    if (!result.success) return Response.json({ success: false, error: result.error }, { status: 500 });
    const parsed = jsonFromText(result.answer || '') as { modo?: string; erro?: string; transacoes?: unknown[] } & Record<string, unknown> | null;
    if (parsed?.modo === 'lote') {
      return Response.json({
        success: true,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        failedProvider: result.failedProvider,
        tipo: 'transacao',
        transacoes: parsed.transacoes || [],
        resposta: `Encontrei **${(parsed.transacoes || []).length} transação${(parsed.transacoes || []).length !== 1 ? 'ões' : ''}** no extrato. Revise e confirme cada uma.`,
        answer: result.answer,
      });
    }
    if (parsed?.modo === 'erro') {
      return Response.json({
        success: true,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        failedProvider: result.failedProvider,
        tipo: 'conversa',
        resposta: `Não consegui identificar transações nesta imagem. ${parsed.erro || 'Tente novamente com mais nitidez.'}`,
        answer: result.answer,
      });
    }
    return Response.json({
      success: true,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      tipo: 'transacao',
      transacao: parsed || undefined,
      resposta: parsed ? `Analisei a imagem e encontrei uma **${String(parsed.tipo || 'transação')}**. Confira e confirme.` : 'Imagem analisada.',
      answer: result.answer,
    });
  }

  if (task === 'analisar_audio_financeiro') {
    const audio = formData.get('audio') as File | null;
    if (!audio) return Response.json({ success: false, error: 'Áudio obrigatório.' }, { status: 400 });
    const result = await runAI({
      task: 'analisar_audio_financeiro',
      provider,
      mode,
      input: { customPrompt: audioPrompt() },
      attachments: [{ mimeType: audio.type || 'audio/webm', data: Buffer.from(await audio.arrayBuffer()).toString('base64') }],
      options: { temperature: 0.1, maxTokens: 900 },
    });
    if (!result.success) return Response.json({ success: false, error: result.error }, { status: 500 });
    const parsed = jsonFromText(result.answer || '') as Record<string, unknown> | null;
    if (parsed?.erro) {
      return Response.json({
        success: true,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        failedProvider: result.failedProvider,
        tipo: 'conversa',
        transcricao: parsed.transcricao || '',
        resposta: 'Entendi o áudio, mas não identifiquei uma transação financeira clara.',
        answer: result.answer,
      });
    }
    return Response.json({
      success: true,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      tipo: 'transacao',
      transcricao: parsed?.transcricao || '',
      transacao: parsed || undefined,
      resposta: 'Áudio analisado. Confira os dados detectados antes de salvar.',
      answer: result.answer,
    });
  }

  if (task === 'analisar_pdf_financeiro') {
    const pdf = formData.get('pdf') as File | null;
    if (!pdf) return Response.json({ success: false, error: 'PDF obrigatório.' }, { status: 400 });
    const result = await runAI({
      task: 'analisar_pdf_financeiro',
      provider,
      mode,
      input: { customPrompt: pdfPrompt() },
      attachments: [{ mimeType: 'application/pdf', data: Buffer.from(await pdf.arrayBuffer()).toString('base64') }],
      options: { temperature: 0, maxTokens: 4000 },
    });
    if (!result.success) return Response.json({ success: false, error: result.error }, { status: 500 });
    const parsed = jsonFromText(result.answer || '') as { erro?: string; transacoes?: Array<{ tipo?: string; valor?: number }>; bancaNome?: string; mesReferencia?: string } | null;
    if (parsed?.erro) {
      return Response.json({
        success: true,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        failedProvider: result.failedProvider,
        tipo: 'conversa',
        resposta: `❌ ${parsed.erro}`,
        answer: result.answer,
      });
    }
    const transacoes = parsed?.transacoes || [];
    const totalValor = transacoes.reduce((sum, item) => sum + (item.tipo === 'despesa' ? Number(item.valor || 0) : 0), 0);
    return Response.json({
      success: true,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      tipo: 'lote',
      transacoes,
      totalValor,
      bancaNome: parsed?.bancaNome,
      mesReferencia: parsed?.mesReferencia,
      resposta: `Fatura analisada com ${transacoes.length} lançamento${transacoes.length !== 1 ? 's' : ''}.`,
      answer: result.answer,
    });
  }

  return Response.json({ success: false, error: 'Tarefa multimodal inválida.' }, { status: 400 });
}

export async function GET() {
  return Response.json({
    success: true,
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'auto',
    fallbackOrder: (process.env.AI_FALLBACK_ORDER || 'gemini,groq,deepseek,gemma4,anthropic').split(',').map((item) => item.trim()),
    models: getProviderStatus(),
  });
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      return handleJsonRequest(await req.json());
    }

    if (contentType.includes('multipart/form-data')) {
      return handleFormDataRequest(await req.formData());
    }

    return Response.json({ success: false, error: 'Formato de requisição não suportado.' }, { status: 415 });
  } catch (error) {
    console.error('[api/ai]', error);
    return Response.json(
      {
        success: false,
        error: 'Não foi possível consultar a IA agora. Tente novamente em instantes.',
      },
      { status: 500 },
    );
  }
}
