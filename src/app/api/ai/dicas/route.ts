import { NextRequest, NextResponse } from 'next/server';
import { AIModelId } from '@/lib/ai/catalog';
import { generateTextWithFallback } from '@/lib/ai/text';

export async function POST(req: NextRequest) {
  try {
    const { transacoes, aiModel } = await req.json() as { transacoes: Record<string, unknown>[]; aiModel?: AIModelId };
    if (!transacoes || transacoes.length === 0) {
      return NextResponse.json({ dicas: [] });
    }

    const resumo = transacoes.slice(0, 50).map((t: Record<string, unknown>) => ({
      descricao: t.descricao,
      valor:     t.valor,
      categoria: (t.categoria as Record<string, unknown>)?.nome,
      tipo:      t.tipo,
      data:      t.data,
    }));

    const prompt = `Você é um consultor financeiro pessoal brasileiro amigável. Analise as transações financeiras abaixo e forneça 3 dicas práticas e personalizadas em português brasileiro.

Transações do mês:
${JSON.stringify(resumo, null, 2)}

Retorne APENAS um JSON válido no formato:
[
  {
    "tipo": "alerta" | "dica" | "conquista" | "previsao",
    "titulo": "título curto e direto",
    "mensagem": "mensagem explicativa com valores reais mencionados"
  }
]

Regras:
- Seja específico com os valores das transações
- Use linguagem informal e amigável (você, seu, sua)
- Mencione os estabelecimentos/categorias reais
- Foque em insights úteis e acionáveis
- Máximo 3 dicas
- Se os dados forem bons, parabenize!
- RESPONDA APENAS JSON, sem markdown.`;

    const result = await generateTextWithFallback({
      task: 'tips',
      preferredModel: aiModel || 'automatico',
      temperature: 0.7,
      maxTokens: 1024,
      system: 'Você é um consultor financeiro pessoal brasileiro amigável.',
      user: prompt,
    });
    const texto  = result.content.trim();
    const clean  = texto.replace(/```json\n?|\n?```/g, '').trim();

    let dicas = [];
    try {
      dicas = JSON.parse(clean);
    } catch {
      dicas = [];
    }

    return NextResponse.json({ dicas, providerUsed: result.providerUsed });
  } catch (error) {
    console.error('Erro ao gerar dicas:', error);
    return NextResponse.json({ dicas: [] });
  }
}
