import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import type { TransacaoExtraida, RespostaAssistente } from '../texto/route';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const HOJE = () => new Date().toISOString().split('T')[0];

const SYSTEM_IMAGEM = `Você é o assistente financeiro do FinanceiroIA.
Analise a imagem enviada (comprovante, nota fiscal, cupom, extrato ou print de transação).

Se for uma única transação, responda com JSON:
{
  "modo": "unico",
  "tipo": "despesa" | "receita",
  "valor": number,
  "descricao": string,
  "categoria": string,
  "data": "YYYY-MM-DD",
  "hora": "HH:MM" | null,
  "metodo_pagamento": "pix" | "credito" | "debito" | "dinheiro" | "nao_informado",
  "parcelas": number | null,
  "local": string | null,
  "banco": string | null,
  "erro": null
}

Se for um extrato com múltiplas transações, responda com JSON:
{
  "modo": "lote",
  "transacoes": [ { ...mesmo formato acima sem "modo"... } ]
}

Se não conseguir identificar: { "modo": "erro", "erro": "motivo" }

Categorias: Alimentação, Mercado, Transporte, Saúde, Educação, Lazer, Roupas, Moradia, Assinaturas, Contas, Pet, Beleza, Presentes, Farmácia, Delivery, Salário, Freelance, Rendimentos, Outros.
Sem data visível → use hoje (${HOJE()})`;

function parseImagemJSON(raw: string):
  | { modo: 'unico' } & TransacaoExtraida
  | { modo: 'lote'; transacoes: TransacaoExtraida[] }
  | { modo: 'erro'; erro: string } {

  const clean = raw.startsWith('```') ? raw.replace(/```json?\n?/g, '').replace(/```/g, '') : raw;
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
    const formData = await req.formData();
    const imagemFile = formData.get('imagem') as File | null;
    const legenda    = formData.get('legenda') as string | null;

    if (!imagemFile) {
      return NextResponse.json({ error: 'imagem obrigatória' }, { status: 400 });
    }

    // Converte para base64
    const buffer   = Buffer.from(await imagemFile.arrayBuffer());
    const base64   = buffer.toString('base64');
    const mime     = (imagemFile.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';

    const userText = legenda
      ? `Legenda do usuário: "${legenda}". Analise este comprovante/nota e extraia os dados financeiros.`
      : 'Analise este comprovante ou nota fiscal e extraia os dados financeiros.';

    const response = await groq.chat.completions.create({
      model: 'llama-3.2-11b-vision-preview',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          { type: 'text', text: userText },
        ] as never,
      }],
    });

    const raw    = response.choices[0]?.message?.content?.trim() ?? '';
    const result = parseImagemJSON(raw);

    if (result.modo === 'unico') {
      const tx = result as unknown as TransacaoExtraida;
      return NextResponse.json({
        tipo: 'transacao',
        transacao: tx,
        resposta: `Analisei a imagem e encontrei uma **${tx.tipo}** de R$ ${tx.valor.toFixed(2).replace('.', ',')}. Confira e confirme.`,
      } satisfies RespostaAssistente);
    }

    if (result.modo === 'lote') {
      const count = result.transacoes.length;
      return NextResponse.json({
        tipo: 'transacao',
        transacoes: result.transacoes,
        resposta: `Encontrei **${count} transação${count > 1 ? 'ões' : ''}** no extrato. Revise e confirme cada uma.`,
      } as RespostaAssistenteImagem);
    }

    // Erro: imagem não reconhecida
    return NextResponse.json({
      tipo: 'conversa',
      resposta: `Não consegui identificar transações nesta imagem. ${result.erro}. Tente enviar um comprovante ou nota fiscal mais legível.`,
    } satisfies RespostaAssistente);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[assistente/imagem]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
