import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TransacaoExtraida, RespostaAssistente } from '@/lib/assistente-types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const HOJE = () => new Date().toISOString().split('T')[0];

const PROMPT_IMAGEM = (legenda?: string | null) => `Você é um extrator de dados financeiros de imagens. Analise o comprovante, nota fiscal ou extrato bancário.
${legenda ? `\nContexto do usuário: "${legenda}"\n` : ''}
TRANSAÇÃO ÚNICA → responda SOMENTE com JSON:
{"modo":"unico","tipo":"despesa","valor":89.90,"descricao":"iFood - Pizza","categoria":"Delivery","data":"${HOJE()}","hora":"20:30","metodo_pagamento":"credito","parcelas":null,"local":"iFood","banco":null}

EXTRATO (múltiplas transações) → responda SOMENTE com JSON:
{"modo":"lote","transacoes":[{"tipo":"despesa","valor":50,"descricao":"Mercado X","categoria":"Mercado","data":"${HOJE()}","hora":null,"metodo_pagamento":"debito","parcelas":null,"local":null,"banco":null}]}

NÃO IDENTIFICADO → responda SOMENTE:
{"modo":"erro","erro":"motivo"}

Categorias: Alimentação, Mercado, Transporte, Saúde, Educação, Lazer, Roupas, Moradia, Assinaturas, Contas, Pet, Beleza, Presentes, Farmácia, Delivery, Salário, Freelance, Rendimentos, Outros.
Data não visível → use hoje (${HOJE()}). RESPONDA APENAS JSON, sem texto adicional.`;

function parseImagemJSON(raw: string):
  | { modo: 'unico' } & TransacaoExtraida
  | { modo: 'lote'; transacoes: TransacaoExtraida[] }
  | { modo: 'erro'; erro: string } {

  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return { modo: 'erro', erro: 'Resposta inválida da IA' };
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (parsed.modo === 'lote' && Array.isArray(parsed.transacoes)) {
      return { modo: 'lote', transacoes: parsed.transacoes as TransacaoExtraida[] };
    }
    if (parsed.modo === 'erro' || parsed.erro) {
      return { modo: 'erro', erro: String(parsed.erro ?? 'Não identificado') };
    }
    return { modo: 'unico', ...parsed } as { modo: 'unico' } & TransacaoExtraida;
  } catch {
    return { modo: 'erro', erro: 'Não consegui interpretar a imagem.' };
  }
}

export interface RespostaAssistenteImagem extends RespostaAssistente {
  transacoes?: TransacaoExtraida[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData  = await req.formData();
    const imagemFile = formData.get('imagem') as File | null;
    const legenda    = formData.get('legenda') as string | null;

    if (!imagemFile) {
      return NextResponse.json({ error: 'imagem obrigatória' }, { status: 400 });
    }

    const buffer   = Buffer.from(await imagemFile.arrayBuffer());
    const base64   = buffer.toString('base64');
    const mimeType = (imagemFile.type || 'image/jpeg');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    });

    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      PROMPT_IMAGEM(legenda),
    ]);

    const raw    = result.response.text().trim();
    const parsed = parseImagemJSON(raw);

    if (parsed.modo === 'unico') {
      const tx = parsed as unknown as TransacaoExtraida;
      return NextResponse.json({
        tipo: 'transacao',
        transacao: tx,
        resposta: `Analisei a imagem e encontrei uma **${tx.tipo}** de R$ ${tx.valor.toFixed(2).replace('.', ',')}. Confira e confirme.`,
      } satisfies RespostaAssistente);
    }

    if (parsed.modo === 'lote') {
      const count = parsed.transacoes.length;
      return NextResponse.json({
        tipo: 'transacao',
        transacoes: parsed.transacoes,
        resposta: `Encontrei **${count} transação${count !== 1 ? 'ões' : ''}** no extrato. Revise e confirme cada uma.`,
      } as RespostaAssistenteImagem);
    }

    return NextResponse.json({
      tipo: 'conversa',
      resposta: `Não consegui identificar transações nesta imagem. ${parsed.erro}. Tente enviar um comprovante ou nota fiscal mais legível.`,
    } satisfies RespostaAssistente);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[assistente/imagem]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
