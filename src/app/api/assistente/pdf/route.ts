import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TransacaoExtraida } from '../texto/route';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const HOJE = () => new Date().toISOString().split('T')[0];

// ── Tipos de resposta ─────────────────────────────────────────────────────────

export interface RespostaPDF {
  tipo: 'lote' | 'conversa';
  transacoes?: TransacaoExtraida[];
  totalValor?: number;
  bancaNome?: string;
  mesReferencia?: string;
  resposta: string;
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const PROMPT_FATURA = `Você é um extrator especializado em faturas de cartão de crédito brasileiras.

Analise este PDF e extraia TODAS as transações/lançamentos da fatura.

Retorne SOMENTE um JSON válido (sem texto, sem markdown):
{
  "bancaNome": "Nome do banco/cartão",
  "mesReferencia": "MM/YYYY",
  "transacoes": [
    {
      "tipo": "despesa",
      "valor": 89.90,
      "descricao": "IFOOD *RESTAURANTE",
      "categoria": "Delivery",
      "data": "YYYY-MM-DD",
      "hora": null,
      "metodo_pagamento": "credito",
      "parcelas": null,
      "local": null,
      "banco": null
    }
  ]
}

REGRAS IMPORTANTES:
- Extraia CADA linha de lançamento individualmente, incluindo parcelas (ex: 2/12)
- tipo = "despesa" para compras | tipo = "receita" para estornos/créditos/pagamentos
- metodo_pagamento sempre = "credito"
- Se houver parcela (ex: 02/06), coloque o número atual em "parcelas"
- data no formato YYYY-MM-DD (use o ano da fatura)
- descricao = exatamente o texto que aparece na fatura (normalize espaços extras)
- Se não conseguir identificar como fatura: {"erro": "não é uma fatura de cartão"}

Categorias disponíveis:
Alimentação, Mercado, Transporte, Saúde, Educação, Lazer, Roupas, Moradia,
Assinaturas, Contas, Pet, Beleza, Presentes, Farmácia, Delivery, Salário, Outros.

Mapeamento automático de categorias:
- iFood / Rappi / UberEats → Delivery
- Mercadão / Carrefour / Extra / Atacadão / Pão de Açúcar → Mercado
- Uber / 99 / BlaBlaCar / Shell / Ipiranga → Transporte
- Netflix / Spotify / Amazon Prime / Disney / Deezer → Assinaturas
- Drogaria / Farmácia / UltraFarma → Farmácia
- Hospital / Clínica / Unimed / Hapvida → Saúde
- Zara / Renner / C&A / Shein / Shopee → Roupas
- Loja / Magazine / Americanas / Amazon / Mercado Livre → Outros

Hoje é ${HOJE()}.`;

// ── Parser ────────────────────────────────────────────────────────────────────

interface FaturaExtraida {
  bancaNome?: string;
  mesReferencia?: string;
  transacoes: TransacaoExtraida[];
  erro?: string;
}

function parseFaturaJSON(raw: string): FaturaExtraida | { erro: string } {
  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return { erro: 'Resposta inválida da IA.' };
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (parsed.erro && typeof parsed.erro === 'string') return { erro: parsed.erro };
    if (!Array.isArray(parsed.transacoes) || parsed.transacoes.length === 0) {
      return { erro: 'Nenhuma transação encontrada na fatura.' };
    }
    return {
      bancaNome:     parsed.bancaNome as string | undefined,
      mesReferencia: parsed.mesReferencia as string | undefined,
      transacoes:    parsed.transacoes as TransacaoExtraida[],
    };
  } catch {
    return { erro: 'Não consegui interpretar a fatura.' };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const pdfFile  = formData.get('pdf') as File | null;

    if (!pdfFile) {
      return NextResponse.json({ error: 'pdf obrigatório' }, { status: 400 });
    }

    // Valida tamanho (máx 20 MB)
    const MAX_BYTES = 20 * 1024 * 1024;
    if (pdfFile.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo permitido: 20 MB.' },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await pdfFile.arrayBuffer());
    const base64 = buffer.toString('base64');

    // gemini-1.5-pro tem janela maior para PDFs densos; flash para faturas simples
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    });

    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType: 'application/pdf' } },
      PROMPT_FATURA,
    ]);

    const raw    = result.response.text().trim();
    const parsed = parseFaturaJSON(raw);

    if ('erro' in parsed) {
      return NextResponse.json({
        tipo: 'conversa',
        resposta: `❌ ${parsed.erro} Certifique-se de enviar o PDF da fatura do cartão.`,
      } satisfies RespostaPDF);
    }

    const totalValor    = parsed.transacoes
      .filter(t => t.tipo === 'despesa')
      .reduce((s, t) => s + t.valor, 0);
    const bancaNome     = parsed.bancaNome ?? 'Cartão';
    const mesReferencia = parsed.mesReferencia ?? '';
    const count         = parsed.transacoes.length;
    const despesas      = parsed.transacoes.filter(t => t.tipo === 'despesa').length;

    return NextResponse.json({
      tipo: 'lote',
      transacoes:    parsed.transacoes,
      totalValor,
      bancaNome,
      mesReferencia,
      resposta: `Fatura **${bancaNome}**${mesReferencia ? ` — ${mesReferencia}` : ''} analisada!\n\nEncontrei **${count} lançamento${count !== 1 ? 's' : ''}** (${despesas} despesas).\n\nTotal de despesas: **R$ ${totalValor.toFixed(2).replace('.', ',')}**\n\nRevise e confirme cada transação abaixo:`,
    } satisfies RespostaPDF);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[assistente/pdf]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
