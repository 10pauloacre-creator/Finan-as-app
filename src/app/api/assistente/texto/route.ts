import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const HOJE = () => new Date().toISOString().split('T')[0];

// ── Tipos exportados ─────────────────────────────────────────────────────────

export interface TransacaoExtraida {
  tipo: 'despesa' | 'receita';
  valor: number;
  descricao: string;
  categoria: string;
  data: string;         // YYYY-MM-DD
  hora?: string | null; // HH:MM
  metodo_pagamento: 'pix' | 'credito' | 'debito' | 'dinheiro' | 'nao_informado';
  parcelas?: number | null;
  local?: string | null;
  banco?: string | null;
}

export interface RespostaAssistente {
  tipo: 'transacao' | 'conversa';
  transacao?: TransacaoExtraida;
  transcricao?: string;
  resposta: string;
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_EXTRACAO = `Você é um extrator de transações financeiras. Analise a mensagem e decida:

CASO 1 — contém gasto ou receita → responda SOMENTE com JSON (sem texto adicional):
{"tipo":"despesa","valor":200,"descricao":"Manutenção geladeira","categoria":"Moradia","data":"2026-04-28","hora":null,"metodo_pagamento":"pix","parcelas":null,"local":null,"banco":"Itaú"}

CASO 2 — não contém gasto/receita identificável → responda SOMENTE:
{"erro":"motivo breve"}

Campos obrigatórios: tipo, valor (number), descricao, categoria, data (YYYY-MM-DD).
Campos opcionais (use null se não informado): hora (HH:MM), metodo_pagamento, parcelas, local, banco.
metodo_pagamento: "pix" | "credito" | "debito" | "dinheiro" | "nao_informado"

Categorias: Alimentação, Mercado, Transporte, Saúde, Educação, Lazer, Roupas, Moradia, Assinaturas, Contas, Pet, Beleza, Presentes, Farmácia, Delivery, Salário, Freelance, Rendimentos, Outros.

Regras rápidas:
iFood/Rappi → Delivery | Mercado/supermercado → Mercado | Uber/99/ônibus → Transporte
Netflix/Spotify → Assinaturas | Farmácia → Farmácia | Aluguel → Moradia | Salário → receita+Salário
Data não informada → ${HOJE()} | Método não informado → "nao_informado"

IMPORTANTE: Responda APENAS com o JSON, sem explicações, sem markdown.`;

const SYSTEM_CONVERSA = `Você é o assistente financeiro do FinanceiroIA, app de controle financeiro pessoal.
Responda em português brasileiro de forma amigável, concisa e útil (máx. 3 parágrafos curtos).
Ajude com dúvidas sobre finanças pessoais, orçamento, investimentos e economia doméstica.
Se o usuário mencionar um gasto sem detalhes suficientes, oriente-o a informar valor e descrição.`;

// ── Parser JSON ──────────────────────────────────────────────────────────────

export function parseTransacaoJSON(raw: string): TransacaoExtraida | { erro: string } {
  // Remove markdown code fences if present
  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return { erro: 'Resposta inválida da IA' };
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    // Erro explícito do modelo
    if (parsed.erro && typeof parsed.erro === 'string' && parsed.erro.length > 0) {
      return { erro: parsed.erro };
    }
    // Verifica campos mínimos para ser uma transação válida
    if (!parsed.valor || !parsed.descricao || !parsed.tipo) {
      return { erro: 'Dados insuficientes na resposta.' };
    }
    // Remove a chave erro (pode ser null) para não poluir o objeto
    delete parsed.erro;
    return parsed as unknown as TransacaoExtraida;
  } catch {
    return { erro: 'Não consegui interpretar a resposta.' };
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { texto } = await req.json() as { texto: string };
    if (!texto?.trim()) {
      return NextResponse.json({ error: 'texto obrigatório' }, { status: 400 });
    }

    // 1. Tenta extrair transação
    const extractRaw = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 512,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_EXTRACAO },
        { role: 'user',   content: texto },
      ],
    });

    const extractResult = parseTransacaoJSON(
      extractRaw.choices[0]?.message?.content?.trim() ?? '',
    );

    if ('valor' in extractResult) {
      const resposta =
        extractResult.tipo === 'despesa'
          ? `Encontrei uma **despesa** de R$ ${extractResult.valor.toFixed(2).replace('.', ',')}. Confira e confirme para salvar.`
          : `Encontrei uma **receita** de R$ ${extractResult.valor.toFixed(2).replace('.', ',')}. Confira e confirme para salvar.`;

      return NextResponse.json({
        tipo: 'transacao',
        transacao: extractResult,
        resposta,
      } satisfies RespostaAssistente);
    }

    // 2. Fallback: resposta conversacional
    const chatRaw = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 512,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_CONVERSA },
        { role: 'user',   content: texto },
      ],
    });

    const resposta = chatRaw.choices[0]?.message?.content?.trim()
      ?? 'Desculpe, não consegui processar sua mensagem. Tente novamente.';

    return NextResponse.json({ tipo: 'conversa', resposta } satisfies RespostaAssistente);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[assistente/texto]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
