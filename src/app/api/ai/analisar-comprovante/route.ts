import { NextRequest, NextResponse } from 'next/server';
import { runAI } from '@/lib/ai/aiService';
import { type AIModelId } from '@/lib/ai/aiModels';
import { callOpenRouterVision } from '@/lib/ai/providers/openRouterProvider';
import { PALAVRAS_CHAVE_CATEGORIAS } from '@/lib/categorias-padrao';

interface ReceiptData {
  estabelecimento: string;
  valor_total: number | null;
  data: string;
  forma_pagamento: string;
  categoria_sugerida: string;
  confianca: number;
  observacoes: string;
  texto_extraido: string;
}

function isMultipart(req: NextRequest) {
  return req.headers.get('content-type')?.toLowerCase().includes('multipart/form-data') ?? false;
}

function jsonFromText(text: string) {
  const clean = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferCategoryId(data: ReceiptData) {
  const source = `${data.categoria_sugerida} ${data.estabelecimento}`.toLowerCase();
  for (const [keyword, categoryId] of Object.entries(PALAVRAS_CHAVE_CATEGORIAS)) {
    if (source.includes(keyword)) return categoryId;
  }

  if (data.forma_pagamento === 'pix') return 'pix_enviado';
  return undefined;
}

function normalizeReceiptData(input?: Record<string, unknown> | null): ReceiptData {
  return {
    estabelecimento: typeof input?.estabelecimento === 'string' ? input.estabelecimento : '',
    valor_total: typeof input?.valor_total === 'number' ? input.valor_total : null,
    data: typeof input?.data === 'string' ? input.data : '',
    forma_pagamento: typeof input?.forma_pagamento === 'string' ? input.forma_pagamento : '',
    categoria_sugerida: typeof input?.categoria_sugerida === 'string' ? input.categoria_sugerida : '',
    confianca: typeof input?.confianca === 'number' ? input.confianca : 0,
    observacoes: typeof input?.observacoes === 'string' ? input.observacoes : '',
    texto_extraido: typeof input?.texto_extraido === 'string' ? input.texto_extraido : '',
  };
}

function buildStructuredPrompt(textoExtraido: string) {
  return `Voce recebeu texto extraido de um comprovante, recibo ou nota fiscal.
Retorne apenas JSON valido neste formato:
{
  "estabelecimento": "",
  "valor_total": null,
  "data": "",
  "forma_pagamento": "",
  "categoria_sugerida": "",
  "confianca": 0,
  "observacoes": "",
  "texto_extraido": ""
}

Regras:
- Use apenas o texto fornecido.
- Se nao identificar um campo, use null ou string vazia.
- Nao invente valores nem datas.
- "confianca" deve ser um numero de 0 a 1.
- "texto_extraido" deve repetir o texto recebido, sem resumir.

Texto extraido:
${textoExtraido}`;
}

const RECEIPT_VISION_PROMPT = `Analise a imagem de comprovante, recibo ou nota fiscal.
Retorne apenas JSON valido neste formato:
{
  "estabelecimento": "",
  "valor_total": null,
  "data": "",
  "forma_pagamento": "",
  "categoria_sugerida": "",
  "confianca": 0,
  "observacoes": "",
  "texto_extraido": ""
}

Regras:
- Nao invente valores, datas ou estabelecimentos.
- Se algum campo nao estiver visivel, use null ou string vazia.
- "confianca" deve ser um numero de 0 a 1.
- "texto_extraido" deve conter o maximo de texto relevante lido na imagem.
- Responda apenas com JSON, sem markdown.`;

export async function POST(req: NextRequest) {
  if (!isMultipart(req)) {
    return NextResponse.json(
      { success: false, error: 'Envie o comprovante como multipart/form-data.' },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Nao foi possivel ler o envio do comprovante.' },
      { status: 400 },
    );
  }

  const foto = formData.get('foto');
  const textoExtraidoManual = String(formData.get('texto_extraido') || '').trim();
  const financialProvider = String(formData.get('financialProvider') || formData.get('aiModel') || 'automatico') as AIModelId;
  const mode = financialProvider !== 'automatico' ? 'manual' : 'auto';

  if (!(foto instanceof File) && !textoExtraidoManual) {
    return NextResponse.json(
      { success: false, error: 'Envie uma imagem do comprovante ou um texto extraido para analise.' },
      { status: 400 },
    );
  }

  if (foto instanceof File) {
    if (!foto.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'Formato invalido. Envie uma imagem JPG, PNG ou WEBP.' },
        { status: 400 },
      );
    }

    const maxBytes = 10 * 1024 * 1024;
    if (foto.size > maxBytes) {
      return NextResponse.json(
        { success: false, error: 'Imagem muito grande. O limite atual e 10 MB.' },
        { status: 400 },
      );
    }
  }

  if (!textoExtraidoManual && !process.env.OPENROUTER_VISION_MODEL) {
    return NextResponse.json(
      { success: false, error: 'Nao ha modelo multimodal configurado para leitura de comprovantes.' },
      { status: 503 },
    );
  }

  try {
    let textoExtraido = textoExtraidoManual;
    let visionJson: Record<string, unknown> | null = null;
    let visionModelUsed: string | undefined;

    if (foto instanceof File) {
      const visionResult = await callOpenRouterVision({
        providerId: 'openrouterFast',
        system: 'Voce e um assistente financeiro prudente especializado em leitura de comprovantes.',
        prompt: RECEIPT_VISION_PROMPT,
        temperature: 0.1,
        maxTokens: 1400,
        attachment: {
          mimeType: foto.type || 'image/jpeg',
          data: Buffer.from(await foto.arrayBuffer()).toString('base64'),
          fileName: foto.name,
        },
      });

      visionModelUsed = visionResult.model;
      visionJson = jsonFromText(visionResult.content);
      if (!textoExtraido && typeof visionJson?.texto_extraido === 'string') {
        textoExtraido = visionJson.texto_extraido;
      }
    }

    let structuredJson = visionJson;
    let modelUsed = visionModelUsed;
    const providerUsed = 'openrouter';
    let fallbackUsed = false;

    if (textoExtraido) {
      const structured = await runAI({
        task: 'estruturar_transacao_de_recibo',
        provider: financialProvider,
        mode,
        input: {
          customPrompt: buildStructuredPrompt(textoExtraido),
        },
        options: { temperature: 0.1, maxTokens: 700 },
      });

      if (!structured.success || !structured.answer) {
        return NextResponse.json(
          { success: false, error: structured.error || 'Nao foi possivel estruturar os dados do comprovante agora.' },
          { status: 503 },
        );
      }

      structuredJson = jsonFromText(structured.answer) || structuredJson;
      modelUsed = structured.modelUsed || modelUsed;
      fallbackUsed = structured.fallbackUsed;
    }

    const data = normalizeReceiptData(structuredJson);
    if (!data.texto_extraido) {
      data.texto_extraido = textoExtraido;
    }

    if (
      !data.estabelecimento &&
      data.valor_total === null &&
      !data.data &&
      !data.forma_pagamento &&
      !data.categoria_sugerida &&
      !data.texto_extraido
    ) {
      return NextResponse.json(
        { success: false, error: 'Nao foi possivel identificar dados suficientes no comprovante enviado.' },
        { status: 422 },
      );
    }

    const categoria_id = inferCategoryId(data);

    return NextResponse.json({
      success: true,
      providerUsed,
      modelUsed: modelUsed || process.env.OPENROUTER_VISION_MODEL || '',
      fallbackUsed,
      revisaoObrigatoria: true,
      data,
      dados: { ...data, categoria_id },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message.includes('OPENROUTER_VISION_MODEL')) {
      return NextResponse.json(
        { success: false, error: 'Nao ha modelo multimodal configurado para leitura de comprovantes.' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { success: false, error: 'Nao foi possivel analisar o comprovante agora. Tente novamente em instantes.' },
      { status: 503 },
    );
  }
}
