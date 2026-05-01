import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseTransacaoJSON } from '@/lib/assistente-types';
import type { TransacaoExtraida, RespostaAssistente } from '@/lib/assistente-types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const HOJE = () => new Date().toISOString().split('T')[0];

// ── Prompts ──────────────────────────────────────────────────────────────────

const PROMPT_EXTRACAO = (texto: string, contexto?: string) => `Você é um extrator de transações financeiras. Analise a mensagem e decida:

CASO 1 — contém gasto ou receita → responda SOMENTE com JSON (sem texto adicional):
{"tipo":"despesa","valor":200,"descricao":"Manutenção geladeira","categoria":"Moradia","data":"${HOJE()}","hora":null,"metodo_pagamento":"pix","parcelas":null,"local":null,"banco":"Itaú"}

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

IMPORTANTE: Responda APENAS com o JSON, sem explicações, sem markdown.
${contexto ? `\nContexto financeiro do usuário:\n${contexto}\n` : ''}
Mensagem: "${texto}"`;

const PROMPT_CONVERSA = (texto: string, contexto?: string) => `Você é o assistente financeiro do FinanceiroIA, app de controle financeiro pessoal.
Responda em português brasileiro de forma amigável, concisa e útil (máx. 3 parágrafos curtos).
Ajude com dúvidas sobre finanças pessoais, orçamento, investimentos e economia doméstica.
Se o usuário mencionar um gasto sem detalhes suficientes, oriente-o a informar valor e descrição.
${contexto ? `\nDados financeiros do usuário (use para responder perguntas específicas):\n${contexto}\n` : ''}
Pergunta: ${texto}`;

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { texto, contexto } = await req.json() as { texto: string; contexto?: string };
    if (!texto?.trim()) {
      return NextResponse.json({ error: 'texto obrigatório' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    });

    // 1. Tenta extrair transação
    const extractResult_raw = await model.generateContent(PROMPT_EXTRACAO(texto, contexto));
    const extractResult = parseTransacaoJSON(
      extractResult_raw.response.text().trim(),
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
    const modelConversa = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    });
    const chatResult = await modelConversa.generateContent(PROMPT_CONVERSA(texto, contexto));
    const resposta = chatResult.response.text().trim()
      || 'Desculpe, não consegui processar sua mensagem. Tente novamente.';

    return NextResponse.json({ tipo: 'conversa', resposta } satisfies RespostaAssistente);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[assistente/texto]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
