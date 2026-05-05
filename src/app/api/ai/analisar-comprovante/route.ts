import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PALAVRAS_CHAVE_CATEGORIAS } from '@/lib/categorias-padrao';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const requestedModel = String(formData.get('aiModel') || 'automatico');

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          erro:
            requestedModel !== 'automatico' && requestedModel !== 'gemini'
              ? 'O modelo escolhido não lê comprovantes diretamente e o fallback multimodal está indisponível agora.'
              : 'A IA de leitura de comprovantes está indisponível no momento.',
        },
        { status: 503 },
      );
    }
    const foto     = formData.get('foto') as File;

    if (!foto) {
      return NextResponse.json({ erro: 'Nenhuma foto enviada' }, { status: 400 });
    }

    const bytes    = await foto.arrayBuffer();
    const base64   = Buffer.from(bytes).toString('base64');
    const mimeType = foto.type || 'image/jpeg';

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
- Se for comprovante de Pix recebido: tipo = "receita", metodo_pagamento = "pix"
- RESPONDA APENAS JSON, sem markdown.`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    });

    const result  = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      prompt,
    ]);

    const texto = result.response.text().trim();

    let dadosExtraidos: Record<string, unknown> = {};
    try {
      const jsonLimpo = texto.replace(/```json\n?|\n?```/g, '').trim();
      dadosExtraidos = JSON.parse(jsonLimpo);
    } catch {
      return NextResponse.json(
        { erro: 'Não foi possível interpretar a resposta da IA' },
        { status: 422 },
      );
    }

    // Mapeia categoria sugerida para categoria do sistema
    const categoriaSugerida = String(
      dadosExtraidos.categoria_sugerida || dadosExtraidos.descricao || '',
    ).toLowerCase();
    let categoria_id: string | undefined;

    for (const [palavra, catId] of Object.entries(PALAVRAS_CHAVE_CATEGORIAS)) {
      if (categoriaSugerida.includes(palavra)) {
        categoria_id = catId;
        break;
      }
    }

    if (!categoria_id && dadosExtraidos.tipo === 'receita') {
      categoria_id = 'pix_recebido';
    }
    if (!categoria_id && dadosExtraidos.metodo_pagamento === 'pix') {
      categoria_id = 'pix_enviado';
    }

    return NextResponse.json({
      dados: { ...dadosExtraidos, categoria_id },
      texto_original: texto,
      providerUsed: 'gemini',
    });
  } catch (error) {
    console.error('Erro ao analisar comprovante:', error);
    return NextResponse.json({ erro: 'Erro interno ao processar imagem' }, { status: 500 });
  }
}
