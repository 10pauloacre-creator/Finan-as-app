import { getLastExecution, getProviderStatus } from '@/lib/ai/aiRouter';
import { AIModelId, AITask } from '@/lib/ai/aiModels';
import { analisarRecibo, diagnoseProviders, runAI } from '@/lib/ai/aiService';
import { sanitizeFinancialData } from '@/lib/ai/sanitizeFinancialData';
import { PALAVRAS_CHAVE_CATEGORIAS } from '@/lib/categorias-padrao';
import { parseCsvFinanceiro } from '@/lib/csv-financeiro';

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
        'Pergunta do usuÃ¡rio:',
        String(input.question || ''),
      ].join('\n'),
    };
  }

  if (task === 'resumo_mensal') {
    const mes = input.mes ? `MÃªs de referÃªncia: ${String(input.mes)}` : '';
    const ano = input.ano ? `Ano de referÃªncia: ${String(input.ano)}` : '';
    return {
      customPrompt: `Gere um relatÃ³rio mensal em JSON no formato:
{
  "resumo": "parÃ¡grafo narrativo de 3-4 frases",
  "nota_mes": "Ã³timo" | "bom" | "regular" | "ruim",
  "destaques": [{ "tipo": "positivo" | "negativo" | "neutro", "titulo": "...", "descricao": "..." }],
  "recomendacoes": [{ "prioridade": "alta" | "media" | "baixa", "acao": "...", "motivo": "..." }],
  "previsao_proximo_mes": "frase curta"
}

Dados do mÃªs:
${mes}
${ano}
${safeInput}

Responda apenas com JSON vÃ¡lido.`,
    };
  }

  if (task === 'gerar_insights') {
    return {
      customPrompt: `Analise os dados e retorne apenas um JSON vÃ¡lido no formato:
[
  {
    "tipo": "alerta" | "dica" | "conquista" | "previsao",
    "titulo": "tÃ­tulo curto",
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
    const descricao = String(input.descricao || 'anÃ¡lise financeira especializada');
    return {
      customPrompt: `Atue como ${nome}, um agente financeiro especializado em ${descricao}, e retorne apenas JSON vÃ¡lido no formato:
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
      customPrompt: `Classifique a transaÃ§Ã£o e responda apenas em JSON:
{ "categoria": "...", "tipo": "despesa" | "receita" | "transferencia", "justificativa": "..." }

Dados:
${safeInput}`,
    };
  }

  if (task === 'plano_economia') {
    return {
      customPrompt: `Monte um plano de economia prÃ¡tico, conservador e viÃ¡vel com base apenas nestes dados:
${safeInput}

Responda em portuguÃªs do Brasil, de forma objetiva, sem inventar valores.`,
    };
  }

  if (task === 'analise_profunda') {
    return {
      customPrompt: `FaÃ§a uma anÃ¡lise profunda das finanÃ§as do usuÃ¡rio com foco em padrÃµes, riscos, oportunidades e prÃ³ximos passos.
Use apenas os dados abaixo, sem inventar valores.

Dados:
${safeInput}

Responda em portuguÃªs do Brasil, com profundidade e objetividade.`,
    };
  }

  if (task === 'detectar_gastos_incomuns') {
    return {
      customPrompt: `Analise os dados e aponte gastos fora do padrÃ£o, concentraÃ§Ãµes preocupantes ou anomalias sem inventar informaÃ§Ãµes:
${safeInput}`,
    };
  }

  if (task === 'analisar_meta') {
    return {
      customPrompt: `Analise a meta financeira e responda com orientaÃ§Ãµes prudentes e objetivas:
${safeInput}`,
    };
  }

  return {
    customPrompt: safeInput,
  };
}

function imagePrompt(legenda?: string | null) {
  return `VocÃª Ã© um extrator de dados financeiros de imagens.
${legenda ? `Contexto do usuÃ¡rio: "${legenda}"\n` : ''}
TRANSAÃÃO ÃNICA: responda SOMENTE com JSON:
{"modo":"unico","tipo":"despesa","valor":89.90,"descricao":"iFood - Pizza","categoria":"Delivery","data":"${HOJE()}","hora":"20:30","metodo_pagamento":"credito","parcelas":null,"local":"iFood","banco":null}

EXTRATO COM MÃLTIPLAS TRANSAÃÃES: responda SOMENTE com JSON:
{"modo":"lote","transacoes":[{"tipo":"despesa","valor":50,"descricao":"Mercado X","categoria":"Mercado","data":"${HOJE()}","hora":null,"metodo_pagamento":"debito","parcelas":null,"local":null,"banco":null}]}

NÃO IDENTIFICADO:
{"modo":"erro","erro":"motivo"}

Responda apenas com JSON vÃ¡lido.`;
}

function audioPrompt() {
  return `Analise um Ã¡udio em portuguÃªs do Brasil e retorne SOMENTE JSON.

Se houver transaÃ§Ã£o financeira:
{"transcricao":"...","tipo":"despesa","valor":50.00,"descricao":"iFood pizza","categoria":"Delivery","data":"${HOJE()}","hora":null,"metodo_pagamento":"pix","parcelas":null,"local":null,"banco":null}

Se nÃ£o houver transaÃ§Ã£o:
{"transcricao":"...","erro":"sem transaÃ§Ã£o identificada"}`;
}

function pdfPrompt() {
  return `VocÃª Ã© um extrator de faturas de cartÃ£o de crÃ©dito brasileiras.
Retorne SOMENTE um JSON vÃ¡lido:
{
  "bancaNome": "Nome do banco/cartÃ£o",
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

Se nÃ£o conseguir identificar a fatura:
{"erro":"nÃ£o Ã© uma fatura de cartÃ£o"}`;
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
    body.action === 'analise_profunda' ? 'analise_profunda' :
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
    options: { temperature: 0.3 },
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
    if (!imagem) return Response.json({ success: false, error: 'Imagem obrigatÃ³ria.' }, { status: 400 });
    const result = await runAI({
      task: 'analisar_imagem_financeira',
      provider,
      mode,
      input: { customPrompt: imagePrompt(legenda) },
      attachments: [{ mimeType: imagem.type || 'image/jpeg', data: Buffer.from(await imagem.arrayBuffer()).toString('base64'), fileName: imagem.name }],
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
        resposta: `Encontrei **${(parsed.transacoes || []).length} transaÃ§Ã£o${(parsed.transacoes || []).length !== 1 ? 'Ãµes' : ''}** no extrato. Revise e confirme cada uma.`,
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
        resposta: `NÃ£o consegui identificar transaÃ§Ãµes nesta imagem. ${parsed.erro || 'Tente novamente com mais nitidez.'}`,
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
      resposta: parsed ? `Analisei a imagem e encontrei uma **${String(parsed.tipo || 'transaÃ§Ã£o')}**. Confira e confirme.` : 'Imagem analisada.',
      answer: result.answer,
    });
  }

  if (task === 'analisar_audio_financeiro') {
    const audio = formData.get('audio') as File | null;
    if (!audio) return Response.json({ success: false, error: 'Ãudio obrigatÃ³rio.' }, { status: 400 });
    const result = await runAI({
      task: 'analisar_audio_financeiro',
      provider,
      mode,
      input: { customPrompt: audioPrompt() },
      attachments: [{ mimeType: audio.type || 'audio/webm', data: Buffer.from(await audio.arrayBuffer()).toString('base64'), fileName: audio.name }],
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
        resposta: 'Entendi o Ã¡udio, mas nÃ£o identifiquei uma transaÃ§Ã£o financeira clara.',
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
      resposta: 'Ãudio analisado. Confira os dados detectados antes de salvar.',
      answer: result.answer,
    });
  }

  if (task === 'analisar_pdf_financeiro') {
    const pdf = formData.get('pdf') as File | null;
    if (!pdf) return Response.json({ success: false, error: 'PDF obrigatÃ³rio.' }, { status: 400 });
    const result = await runAI({
      task: 'analisar_pdf_financeiro',
      provider,
      mode,
      input: { customPrompt: pdfPrompt() },
      attachments: [{ mimeType: 'application/pdf', data: Buffer.from(await pdf.arrayBuffer()).toString('base64'), fileName: pdf.name }],
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
        resposta: `â ${parsed.erro}`,
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
      resposta: `Fatura analisada com ${transacoes.length} lanÃ§amento${transacoes.length !== 1 ? 's' : ''}.`,
      answer: result.answer,
    });
  }


  if (task === 'analisar_csv_financeiro') {
    const csv = formData.get('csv') as File | null;
    if (!csv) return Response.json({ success: false, error: 'CSV obrigatorio.' }, { status: 400 });

    const text = await csv.text();
    const parsed = parseCsvFinanceiro(text);
    if (!parsed.transacoes.length) {
      return Response.json({ success: false, error: 'Nao encontrei lancamentos validos nesse CSV.' }, { status: 422 });
    }

    return Response.json({
      success: true,
      providerUsed: 'local-csv',
      modelUsed: 'csv-parser',
      fallbackUsed: false,
      tipo: 'lote',
      transacoes: parsed.transacoes,
      totalValor: parsed.totalValor,
      bancaNome: parsed.bancaNome,
      mesReferencia: parsed.mesReferencia,
      resposta: `CSV analisado com ${parsed.transacoes.length} lancamento${parsed.transacoes.length !== 1 ? 's' : ''}. Revise antes de salvar.`,
    });
  }
  return Response.json({ success: false, error: 'Tarefa multimodal invÃ¡lida.' }, { status: 400 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shouldCheck = url.searchParams.get('check') === '1';
  const diagnostics = shouldCheck ? await diagnoseProviders() : undefined;
  const models = getProviderStatus();
  const lastExecution = getLastExecution();

  return Response.json({
    success: true,
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'auto',
    fallbackOrder: (process.env.AI_FALLBACK_ORDER || 'openrouterFast,openrouterFree,openrouterReasoning,gemini,groq,deepseek,gemma4,anthropic').split(',').map((item) => item.trim()),
    models,
    openrouter: {
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      fastModel: process.env.OPENROUTER_FAST_MODEL || 'google/gemini-2.5-flash',
      reasoningModel: process.env.OPENROUTER_REASONING_MODEL || 'deepseek/deepseek-chat',
      premiumModel: process.env.OPENROUTER_PREMIUM_MODEL || 'anthropic/claude-sonnet-4.5',
      freeModel: process.env.OPENROUTER_FREE_MODEL || 'openrouter/free',
    },
    lastExecution,
    diagnostics,
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

    return Response.json({ success: false, error: 'Formato de requisiÃ§Ã£o nÃ£o suportado.' }, { status: 415 });
  } catch (error) {
    console.error('[api/ai]', error);
    return Response.json(
      {
        success: false,
        error: 'NÃ£o foi possÃ­vel consultar a IA agora. Tente novamente em instantes.',
      },
      { status: 500 },
    );
  }
}

