import { NextRequest, NextResponse } from 'next/server';
import { AIModelId } from '@/lib/ai/catalog';
import { generateTextWithFallback } from '@/lib/ai/text';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { contexto, mes, ano, aiModel } = await req.json() as {
      contexto: string;
      mes: number;
      ano: number;
      aiModel?: AIModelId;
    };

    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const nomeMes = meses[mes - 1] ?? 'Mês';

    const prompt = `Você é um consultor financeiro pessoal brasileiro gerando o relatório mensal de ${nomeMes} de ${ano}.

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
- Máx 3 destaques, máx 3 recomendações
- Use valores reais (R$ X,XX) nas descrições
- Seja específico, não genérico
- Tom amigável, como um conselheiro de confiança
- Responda APENAS JSON válido`;

    const result = await generateTextWithFallback({
      task: 'report',
      preferredModel: aiModel || 'automatico',
      temperature: 0.5,
      maxTokens: 1536,
      system: `Você é um consultor financeiro pessoal brasileiro gerando o relatório mensal de ${nomeMes} de ${ano}.`,
      user: prompt,
    });
    const raw = result.content.trim()
      .replace(/```json\n?/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match?.[0] ?? '{}');
    } catch {
      parsed = { resumo: 'Não foi possível gerar o relatório.', nota_mes: 'regular', destaques: [], recomendacoes: [] };
    }

    return NextResponse.json({ ...parsed, mes, ano, providerUsed: result.providerUsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
