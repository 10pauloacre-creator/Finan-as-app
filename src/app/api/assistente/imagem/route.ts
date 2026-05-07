import { NextRequest, NextResponse } from 'next/server';
import { runAI } from '@/lib/ai/aiService';
import type { AIModelId } from '@/lib/ai/aiModels';
import type { TransacaoExtraida, RespostaAssistente } from '@/lib/assistente-types';

const HOJE = () => new Date().toISOString().split('T')[0];

const PROMPT_IMAGEM = (legenda?: string | null) => `Voce e um extrator de dados financeiros de imagens. Analise o comprovante, nota fiscal ou extrato bancario.
${legenda ? `Contexto do usuario: "${legenda}"\n` : ''}
Se a imagem for uma lista de lancamentos de cartao, extraia cada linha com data, detalhe da compra, parcela e valor.
TRANSACAO UNICA: responda SOMENTE com JSON:
{"modo":"unico","tipo":"despesa","valor":89.90,"descricao":"iFood - Pizza","categoria":"Delivery","data":"${HOJE()}","hora":"20:30","metodo_pagamento":"credito","parcelas":null,"local":"iFood","banco":null}

EXTRATO COM MULTIPLAS TRANSACOES: responda SOMENTE com JSON:
{"modo":"lote","transacoes":[{"tipo":"despesa","valor":50,"descricao":"Mercado X","categoria":"Mercado","data":"${HOJE()}","hora":null,"metodo_pagamento":"debito","parcelas":null,"local":null,"banco":null}]}

NAO IDENTIFICADO:
{"modo":"erro","erro":"motivo"}

Responda apenas com JSON valido.`;

function isMultipart(req: NextRequest) {
  return req.headers.get('content-type')?.toLowerCase().includes('multipart/form-data') ?? false;
}

function parseImagemJSON(raw: string):
  | ({ modo: 'unico' } & TransacaoExtraida)
  | { modo: 'lote'; transacoes: TransacaoExtraida[] }
  | { modo: 'erro'; erro: string } {
  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return { modo: 'erro', erro: 'Resposta invalida da IA.' };

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (parsed.modo === 'lote' && Array.isArray(parsed.transacoes)) {
      return { modo: 'lote', transacoes: parsed.transacoes as TransacaoExtraida[] };
    }
    if (parsed.modo === 'erro' || parsed.erro) {
      return { modo: 'erro', erro: String(parsed.erro ?? 'Nao identificado') };
    }
    return { modo: 'unico', ...parsed } as { modo: 'unico' } & TransacaoExtraida;
  } catch {
    return { modo: 'erro', erro: 'Nao consegui interpretar a imagem.' };
  }
}

export interface RespostaAssistenteImagem extends RespostaAssistente {
  transacoes?: TransacaoExtraida[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isMultipart(req)) {
    return NextResponse.json({ error: 'Envie a imagem como multipart/form-data.' }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Nao foi possivel ler a imagem enviada.' }, { status: 400 });
  }

  const imagemFile = formData.get('imagem');
  const legenda = formData.get('legenda');
  const aiModel = String(formData.get('aiModel') || 'automatico') as AIModelId;

  if (!(imagemFile instanceof File)) {
    return NextResponse.json({ error: 'imagem obrigatoria' }, { status: 400 });
  }

  if (!imagemFile.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Formato de imagem invalido.' }, { status: 400 });
  }

  if (!process.env.OPENROUTER_VISION_MODEL) {
    return NextResponse.json(
      { error: 'A leitura de imagens ainda nao esta disponivel nesta configuracao.' },
      { status: 503 },
    );
  }

  try {
    const base64 = Buffer.from(await imagemFile.arrayBuffer()).toString('base64');
    const result = await runAI({
      task: 'analisar_imagem_financeira',
      provider: aiModel,
      mode: aiModel !== 'automatico' ? 'manual' : 'auto',
      input: { customPrompt: PROMPT_IMAGEM(typeof legenda === 'string' ? legenda : null) },
      attachments: [{ mimeType: imagemFile.type || 'image/jpeg', data: base64, fileName: imagemFile.name }],
      options: { temperature: 0.1, maxTokens: 1200 },
    });

    if (!result.success || !result.answer) {
      return NextResponse.json(
        { error: result.error || 'Nao foi possivel analisar a imagem agora.' },
        { status: 503 },
      );
    }

    const parsed = parseImagemJSON(result.answer);

    if (parsed.modo === 'unico') {
      const tx = parsed as TransacaoExtraida;
      return NextResponse.json({
        tipo: 'transacao',
        transacao: tx,
        resposta: `Analisei a imagem e encontrei uma **${tx.tipo}** de R$ ${tx.valor.toFixed(2).replace('.', ',')}. Confira e confirme.`,
        providerUsed: result.providerUsed,
      } satisfies RespostaAssistente);
    }

    if (parsed.modo === 'lote') {
      const count = parsed.transacoes.length;
      return NextResponse.json({
        tipo: 'transacao',
        transacoes: parsed.transacoes,
        resposta: `Encontrei **${count} transacao${count !== 1 ? 'oes' : ''}** no extrato. Revise e confirme cada uma.`,
        providerUsed: result.providerUsed,
      } as RespostaAssistenteImagem);
    }

    return NextResponse.json({
      tipo: 'conversa',
      resposta: `Nao consegui identificar transacoes nesta imagem. ${parsed.erro}. Tente enviar um comprovante ou nota fiscal mais legivel.`,
      providerUsed: result.providerUsed,
    } satisfies RespostaAssistente);
  } catch {
    return NextResponse.json(
      { error: 'Nao foi possivel analisar a imagem agora. Tente novamente em instantes.' },
      { status: 503 },
    );
  }
}
