import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ dicas: [] }, { status: 200 });
    }

    const { transacoes } = await req.json();
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

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    });

    const result = await model.generateContent(prompt);
    const texto  = result.response.text().trim();
    const clean  = texto.replace(/```json\n?|\n?```/g, '').trim();

    let dicas = [];
    try {
      dicas = JSON.parse(clean);
    } catch {
      dicas = [];
    }

    return NextResponse.json({ dicas });
  } catch (error) {
    console.error('Erro ao gerar dicas:', error);
    return NextResponse.json({ dicas: [] });
  }
}
