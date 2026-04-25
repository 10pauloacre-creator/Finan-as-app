import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sua_chave_aqui') {
      return NextResponse.json({ dicas: [] }, { status: 200 });
    }

    const { transacoes, periodo } = await req.json();

    if (!transacoes || transacoes.length === 0) {
      return NextResponse.json({ dicas: [] });
    }

    // Prepara resumo dos dados para enviar à IA
    const resumo = transacoes.slice(0, 50).map((t: Record<string, unknown>) => ({
      descricao: t.descricao,
      valor: t.valor,
      categoria: (t.categoria as Record<string, unknown>)?.nome,
      tipo: t.tipo,
      data: t.data,
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
- Maximum 3 dicas
- Se os dados forem bons, parabenize!`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const texto = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const jsonLimpo = texto.replace(/```json\n?|\n?```/g, '').trim();

    let dicas = [];
    try {
      dicas = JSON.parse(jsonLimpo);
    } catch {
      dicas = [];
    }

    return NextResponse.json({ dicas });
  } catch (error) {
    console.error('Erro ao gerar dicas:', error);
    return NextResponse.json({ dicas: [] });
  }
}
