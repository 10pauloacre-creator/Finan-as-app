import { NextRequest, NextResponse } from 'next/server';
import type { AIModelId } from '@/lib/ai/aiModels';
import { runAI } from '@/lib/ai/aiService';

type AgenteId = 'albert' | 'marie' | 'galileu';

const PERSONA: Record<AgenteId, { nome: string; papel: string; emoji: string }> = {
  albert: { nome: 'Albert', emoji: '🔍', papel: 'monitor diário de anomalias financeiras' },
  marie: { nome: 'Marie', emoji: '📊', papel: 'analista comportamental financeira quinzenal' },
  galileu: { nome: 'Galileu', emoji: '🔭', papel: 'estrategista financeiro mensal' },
};

const INSTRUCOES: Record<AgenteId, string> = {
  albert: `Você é Albert, monitor financeiro diário. Analise os dados e identifique:
1. Cobranças incomuns ou fora do padrão
2. Gastos que aumentaram significativamente em relação ao histórico
3. Alertas urgentes que o usuário precisa saber hoje
Seja direto, conciso e foque em ações imediatas. Máx 3 insights. Formato JSON:
{"insights":[{"tipo":"alerta"|"ok","titulo":"...","mensagem":"...","acao":"..."}]}`,

  marie: `Você é Marie, analista comportamental. Analise os dados e identifique:
1. Tendências de gastos emergentes
2. Padrões comportamentais por contexto, horário ou recorrência
3. Oportunidades de economia baseadas no comportamento real
Seja empática, perspicaz e prática. Máx 3 insights. Formato JSON:
{"insights":[{"tipo":"tendencia"|"padrao"|"oportunidade","titulo":"...","mensagem":"...","acao":"..."}]}`,

  galileu: `Você é Galileu, estrategista financeiro. Analise os dados e forneça:
1. Projeção dos próximos 30 dias de receitas e despesas
2. Recomendação estratégica de alocação de recursos
3. Meta financeira prioritária a perseguir agora
Seja preciso, estratégico e orientado a longo prazo. Máx 3 insights. Formato JSON:
{"insights":[{"tipo":"projecao"|"estrategia"|"meta","titulo":"...","mensagem":"...","acao":"..."}]}`,
};

function jsonFromText(text: string) {
  const clean = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as { insights?: unknown[] };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { agente, contexto, aiModel } = await req.json() as {
      agente: AgenteId;
      contexto: string;
      aiModel?: AIModelId;
    };

    if (!agente || !PERSONA[agente]) {
      return NextResponse.json({ success: false, error: 'Agente inválido.' }, { status: 400 });
    }

    const { nome, emoji, papel } = PERSONA[agente];
    const instrucoes = INSTRUCOES[agente];

    const result = await runAI({
      task: 'agente_financeiro',
      provider: aiModel || 'automatico',
      mode: aiModel && aiModel !== 'automatico' ? 'manual' : 'auto',
      options: { temperature: 0.6, maxTokens: 1024 },
      input: {
        customPrompt: `Você é ${nome} ${emoji}, ${papel} do FinanceiroIA.

${instrucoes}

DADOS FINANCEIROS DO USUÁRIO:
${contexto}

IMPORTANTE: Responda APENAS com o JSON válido pedido. Sem markdown, sem texto adicional.
Use português brasileiro informal e amigável nas mensagens.`,
      },
    });

    if (!result.success || !result.answer) {
      return NextResponse.json(
        { success: false, error: result.error || 'Não foi possível consultar a IA agora. Tente novamente em instantes.' },
        { status: 503 },
      );
    }

    const parsed = jsonFromText(result.answer);

    return NextResponse.json({
      success: true,
      agente,
      nome,
      emoji,
      insights: parsed?.insights || [],
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      answer: result.answer,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[agentes]', msg);
    return NextResponse.json(
      { success: false, error: 'Não foi possível consultar a IA agora. Tente novamente em instantes.' },
      { status: 500 },
    );
  }
}
