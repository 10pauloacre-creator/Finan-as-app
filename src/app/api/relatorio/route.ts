import { NextRequest, NextResponse } from 'next/server';
import type { AIModelId } from '@/lib/ai/aiModels';
import { runAI } from '@/lib/ai/aiService';

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { contexto, mes, ano, aiModel } = await req.json() as {
      contexto: string;
      mes: number;
      ano: number;
      aiModel?: AIModelId;
    };

    const result = await runAI({
      task: 'resumo_mensal',
      provider: aiModel || 'automatico',
      mode: aiModel && aiModel !== 'automatico' ? 'manual' : 'auto',
      options: { temperature: 0.5, maxTokens: 1536 },
      input: {
        customPrompt: `Você é um consultor financeiro pessoal brasileiro gerando um relatório mensal.

Analise os dados financeiros abaixo e gere um relatório completo em JSON (sem markdown):

{
  "resumo": "parágrafo narrativo de 3-4 frases resumindo o mês em linguagem natural e amigável",
  "nota_mes": "ótimo" | "bom" | "regular" | "ruim",
  "destaques": [
    { "tipo": "positivo" | "negativo" | "neutro", "titulo": "...", "descricao": "..." }
  ],
  "recomendacoes": [
    { "prioridade": "alta" | "media" | "baixa", "acao": "...", "motivo": "..." }
  ],
  "previsao_proximo_mes": "frase curta prevendo o próximo mês baseada nos padrões"
}

DADOS FINANCEIROS:
${contexto}

Regras:
- MÁX 3 destaques e MÁX 3 recomendações
- Use valores reais quando eles estiverem disponíveis no contexto
- Seja específico, prudente e útil
- Responda APENAS JSON válido.`,
      },
    });

    if (!result.success || !result.answer) {
      return NextResponse.json(
        { success: false, error: result.error || 'Não foi possível consultar a IA agora. Tente novamente em instantes.' },
        { status: 503 },
      );
    }

    const parsed = jsonFromText(result.answer) || {
      resumo: 'Não foi possível gerar o relatório.',
      nota_mes: 'regular',
      destaques: [],
      recomendacoes: [],
      previsao_proximo_mes: '',
    };

    return NextResponse.json({
      success: true,
      ...parsed,
      mes,
      ano,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      answer: result.answer,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro';
    console.error('[relatorio]', msg);
    return NextResponse.json(
      { success: false, error: 'Não foi possível consultar a IA agora. Tente novamente em instantes.' },
      { status: 500 },
    );
  }
}
