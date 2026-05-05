import { NextRequest, NextResponse } from 'next/server';
import { AIModelId } from '@/lib/ai/catalog';
import { generateTextWithFallback } from '@/lib/ai/text';

type AgenteId = 'albert' | 'marie' | 'galileu';

const PERSONA: Record<AgenteId, { nome: string; papel: string; emoji: string }> = {
  albert:  { nome: 'Albert',  emoji: '🔍', papel: 'monitor diário de anomalias financeiras' },
  marie:   { nome: 'Marie',   emoji: '📊', papel: 'analista comportamental financeira quinzenal' },
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
1. Tendências de gastos emergentes (o que está crescendo silenciosamente?)
2. Padrões comportamentais — categorias que variam com dia da semana/hora
3. Oportunidades de economia baseadas no comportamento real
Seja empática, psicológica e perspicaz. Máx 3 insights. Formato JSON:
{"insights":[{"tipo":"tendencia"|"padrao"|"oportunidade","titulo":"...","mensagem":"...","acao":"..."}]}`,

  galileu: `Você é Galileu, estrategista financeiro. Analise os dados e forneça:
1. Projeção dos próximos 30 dias de receitas e despesas
2. Recomendação estratégica de alocação de recursos
3. Meta financeira prioritária a perseguir agora
Seja preciso, estratégico e orientado a longo prazo. Máx 3 insights. Formato JSON:
{"insights":[{"tipo":"projecao"|"estrategia"|"meta","titulo":"...","mensagem":"...","acao":"..."}]}`,
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { agente, contexto, aiModel } = await req.json() as { agente: AgenteId; contexto: string; aiModel?: AIModelId };

    if (!agente || !PERSONA[agente]) {
      return NextResponse.json({ error: 'agente inválido' }, { status: 400 });
    }

    const { nome, emoji, papel } = PERSONA[agente];
    const instrucoes = INSTRUCOES[agente];

    const prompt = `Você é ${nome} ${emoji}, ${papel} do FinanceiroIA.

${instrucoes}

DADOS FINANCEIROS DO USUÁRIO:
${contexto}

IMPORTANTE: Responda APENAS com o JSON válido pedido. Sem markdown, sem texto adicional.
Use português brasileiro informal e amigável nas mensagens.`;

    const result = await generateTextWithFallback({
      task: 'agents',
      preferredModel: aiModel || 'automatico',
      temperature: 0.6,
      maxTokens: 1024,
      system: `Você é ${nome} ${emoji}, ${papel} do FinanceiroIA.`,
      user: prompt,
    });
    const raw = result.content.trim()
      .replace(/```json\n?/g, '').replace(/```/g, '').trim();

    let parsed: { insights: unknown[] };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match?.[0] ?? '{"insights":[]}');
    } catch {
      parsed = { insights: [] };
    }
    return NextResponse.json({ agente, nome, emoji, insights: parsed.insights, providerUsed: result.providerUsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[agentes]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
