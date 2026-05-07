import { NextRequest, NextResponse } from 'next/server';
import { runAI } from '@/lib/ai/aiService';
import type { AIModelId } from '@/lib/ai/aiModels';
import type { TransacaoExtraida } from '@/lib/assistente-types';

const HOJE = () => new Date().toISOString().split('T')[0];

export interface RespostaPDF {
  tipo: 'lote' | 'conversa';
  transacoes?: TransacaoExtraida[];
  totalValor?: number;
  bancaNome?: string;
  mesReferencia?: string;
  resposta: string;
  providerUsed?: string;
}

const PROMPT_FATURA = `Voce e um extrator especializado em faturas de cartao de credito brasileiras.

Analise este PDF e extraia todas as transacoes e lancamentos da fatura.
Para cada lancamento, capture obrigatoriamente data, detalhe/descricao da compra, numero de parcelas quando aparecer e valor.
Ignore totais, limite, pagamento minimo e resumos que nao sejam lancamentos individuais.
Se houver estorno ou credito identificado, use "tipo":"receita". Compras normais devem usar "tipo":"despesa".

Retorne somente um JSON valido:
{
  "bancaNome": "Nome do banco/cartao",
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

Se nao conseguir identificar a fatura, retorne:
{"erro":"nao e uma fatura de cartao"}`;

function extractTextFromSimplePdf(pdfBuffer: Buffer) {
  const raw = pdfBuffer.toString('latin1');
  const matches = [...raw.matchAll(/\(([^()]*)\)\s*Tj/g)];
  const lines = matches
    .map((match) => match[1].replace(/\\([()\\])/g, '$1').trim())
    .filter(Boolean);

  return lines.join('\n').trim();
}

function isMultipart(req: NextRequest) {
  return req.headers.get('content-type')?.toLowerCase().includes('multipart/form-data') ?? false;
}

interface FaturaExtraida {
  bancaNome?: string;
  mesReferencia?: string;
  transacoes: TransacaoExtraida[];
  erro?: string;
}

function parseFaturaJSON(raw: string): FaturaExtraida | { erro: string } {
  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return { erro: 'Resposta invalida da IA.' };

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (parsed.erro && typeof parsed.erro === 'string') return { erro: parsed.erro };
    if (!Array.isArray(parsed.transacoes) || parsed.transacoes.length === 0) {
      return { erro: 'Nenhuma transacao encontrada na fatura.' };
    }

    return {
      bancaNome: parsed.bancaNome as string | undefined,
      mesReferencia: parsed.mesReferencia as string | undefined,
      transacoes: parsed.transacoes as TransacaoExtraida[],
    };
  } catch {
    return { erro: 'Nao consegui interpretar a fatura.' };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isMultipart(req)) {
    return NextResponse.json({ error: 'Envie o PDF como multipart/form-data.' }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Nao foi possivel ler o PDF enviado.' }, { status: 400 });
  }

  const pdfFile = formData.get('pdf');
  const aiModel = String(formData.get('aiModel') || 'automatico') as AIModelId;

  if (!(pdfFile instanceof File)) {
    return NextResponse.json({ error: 'pdf obrigatorio' }, { status: 400 });
  }

  if (pdfFile.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Formato invalido. Envie um arquivo PDF.' }, { status: 400 });
  }

  const maxBytes = 20 * 1024 * 1024;
  if (pdfFile.size > maxBytes) {
    return NextResponse.json({ error: 'Arquivo muito grande. Maximo permitido: 20 MB.' }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: 'A analise de PDF ainda nao esta disponivel nesta configuracao.' },
      { status: 503 },
    );
  }

  try {
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const base64 = pdfBuffer.toString('base64');
    let result = await runAI({
      task: 'analisar_pdf_financeiro',
      provider: aiModel,
      mode: aiModel !== 'automatico' ? 'manual' : 'auto',
      input: { customPrompt: PROMPT_FATURA },
      attachments: [{ mimeType: 'application/pdf', data: base64, fileName: pdfFile.name }],
      options: { temperature: 0, maxTokens: 4000 },
    });

    if (!result.success || !result.answer) {
      const extractedText = extractTextFromSimplePdf(pdfBuffer);
      if (extractedText) {
        result = await runAI({
          task: 'analisar_pdf_financeiro',
          provider: aiModel,
          mode: aiModel !== 'automatico' ? 'manual' : 'auto',
          input: {
            customPrompt: `${PROMPT_FATURA}

O parser direto do PDF falhou. Use somente o texto extraido abaixo para montar a resposta em JSON, sem inventar dados:
${extractedText}`,
          },
          options: { temperature: 0, maxTokens: 2000 },
        });
      }
    }

    if (!result.success || !result.answer) {
      return NextResponse.json(
        { error: result.error || 'Nao foi possivel analisar o PDF agora.' },
        { status: 503 },
      );
    }

    const parsed = parseFaturaJSON(result.answer);
    if ('erro' in parsed) {
      return NextResponse.json({
        tipo: 'conversa',
        resposta: `Nao consegui concluir a leitura da fatura. ${parsed.erro}`,
        providerUsed: result.providerUsed,
      } satisfies RespostaPDF);
    }

    const totalValor = parsed.transacoes
      .filter((tx) => tx.tipo === 'despesa')
      .reduce((sum, tx) => sum + tx.valor, 0);
    const bancaNome = parsed.bancaNome ?? 'Cartao';
    const mesReferencia = parsed.mesReferencia ?? '';
    const count = parsed.transacoes.length;
    const despesas = parsed.transacoes.filter((tx) => tx.tipo === 'despesa').length;

    return NextResponse.json({
      tipo: 'lote',
      transacoes: parsed.transacoes,
      totalValor,
      bancaNome,
      mesReferencia,
      resposta: `Fatura **${bancaNome}**${mesReferencia ? ` - ${mesReferencia}` : ''} analisada. Encontrei **${count} lancamento${count !== 1 ? 's' : ''}** (${despesas} despesas). Revise antes de salvar.`,
      providerUsed: result.providerUsed,
    } satisfies RespostaPDF);
  } catch {
    return NextResponse.json(
      { error: 'Nao foi possivel analisar o PDF agora. Tente novamente em instantes.' },
      { status: 503 },
    );
  }
}
