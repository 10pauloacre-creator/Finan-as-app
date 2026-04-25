import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PALAVRAS_CHAVE_CATEGORIAS } from '@/lib/categorias-padrao';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sua_chave_aqui') {
      return NextResponse.json({ erro: 'Claude API não configurada' }, { status: 500 });
    }

    const formData = await req.formData();
    const foto = formData.get('foto') as File;

    if (!foto) {
      return NextResponse.json({ erro: 'Nenhuma foto enviada' }, { status: 400 });
    }

    // Converte o arquivo para base64
    const bytes = await foto.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mediaType = foto.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

    const prompt = `Você é um assistente financeiro brasileiro. Analise esta imagem de comprovante, recibo ou extrato bancário e extraia as informações de transação.

Retorne SOMENTE um JSON válido no formato abaixo, sem texto extra:

{
  "descricao": "nome do estabelecimento ou descrição da transação",
  "valor": 00.00,
  "data": "YYYY-MM-DD",
  "horario": "HH:mm",
  "metodo_pagamento": "pix" | "debito" | "credito" | "dinheiro" | "transferencia" | "outro",
  "parcelas": 1,
  "local": "nome do local se visível",
  "tipo": "despesa" | "receita",
  "categoria_sugerida": "categoria em português",
  "destinatario": "nome do destinatário se for Pix/TED"
}

Regras:
- Se não encontrar algum campo, use null
- Data no formato YYYY-MM-DD
- Valor como número decimal (ex: 47.50, não "47,50")
- Parcelas como número inteiro
- Se for comprovante de Pix enviado: tipo = "despesa", metodo_pagamento = "pix"
- Se for comprovante de Pix recebido: tipo = "receita", metodo_pagamento = "pix"`;

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const textoResposta = response.content[0].type === 'text' ? response.content[0].text : '';

    // Tenta fazer o parse do JSON
    let dadosExtraidos: Record<string, unknown> = {};
    try {
      // Remove possíveis markdown code blocks
      const jsonLimpo = textoResposta.replace(/```json\n?|\n?```/g, '').trim();
      dadosExtraidos = JSON.parse(jsonLimpo);
    } catch {
      return NextResponse.json({ erro: 'Não foi possível interpretar a resposta da IA' }, { status: 422 });
    }

    // Tenta mapear a categoria sugerida para uma categoria do sistema
    const categoriaSugerida = String(dadosExtraidos.categoria_sugerida || dadosExtraidos.descricao || '').toLowerCase();
    let categoria_id: string | undefined;

    for (const [palavra, catId] of Object.entries(PALAVRAS_CHAVE_CATEGORIAS)) {
      if (categoriaSugerida.includes(palavra)) {
        categoria_id = catId;
        break;
      }
    }

    // Se for pix recebido, categoria padrão
    if (!categoria_id && dadosExtraidos.tipo === 'receita') {
      categoria_id = 'pix_recebido';
    }
    if (!categoria_id && dadosExtraidos.metodo_pagamento === 'pix') {
      categoria_id = 'pix_enviado';
    }

    return NextResponse.json({
      dados: {
        ...dadosExtraidos,
        categoria_id,
      },
      texto_original: textoResposta,
    });
  } catch (error) {
    console.error('Erro ao analisar comprovante:', error);
    return NextResponse.json({ erro: 'Erro interno ao processar imagem' }, { status: 500 });
  }
}
