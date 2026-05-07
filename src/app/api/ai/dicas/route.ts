import { NextRequest, NextResponse } from 'next/server';
import { runAI } from '@/lib/ai/aiService';
import type { AIModelId } from '@/lib/ai/aiModels';

function jsonFromText(text: string) {
  const clean = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const arrayMatch = clean.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    return JSON.parse(arrayMatch[0]) as unknown[];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const { transacoes, aiModel } = await req.json() as { transacoes: Record<string, unknown>[]; aiModel?: AIModelId };
    if (!transacoes || transacoes.length === 0) {
      return NextResponse.json({ dicas: [] });
    }

    const resumo = transacoes.slice(0, 50).map((transacao) => ({
      descricao: transacao.descricao,
      valor: transacao.valor,
      categoria: (transacao.categoria as Record<string, unknown>)?.nome,
      tipo: transacao.tipo,
      data: transacao.data,
    }));

    const result = await runAI({
      task: 'gerar_insights',
      provider: aiModel || 'automatico',
      mode: (aiModel || 'automatico') !== 'automatico' ? 'manual' : 'auto',
      input: {
        customPrompt: `Analise as transações abaixo e retorne apenas JSON válido no formato:
[
  {
    "tipo": "alerta" | "dica" | "conquista" | "previsao",
    "titulo": "titulo curto",
    "mensagem": "mensagem objetiva com base apenas nos dados"
  }
]

Transações:
${JSON.stringify(resumo, null, 2)}`,
      },
      options: { temperature: 0.4, maxTokens: 900 },
    });

    if (!result.success || !result.answer) {
      return NextResponse.json({ dicas: [] });
    }

    return NextResponse.json({
      dicas: jsonFromText(result.answer),
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
    });
  } catch (error) {
    console.error('Erro ao gerar dicas:', error);
    return NextResponse.json({ dicas: [] });
  }
}
