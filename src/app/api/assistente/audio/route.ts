import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseTransacaoJSON } from '@/lib/assistente-types';
import type { RespostaAssistente } from '@/lib/assistente-types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const HOJE = () => new Date().toISOString().split('T')[0];

// Gemini suporta estes formatos de áudio inline
const MIME_MAP: Record<string, string> = {
  webm: 'audio/webm',
  ogg:  'audio/ogg',
  mp4:  'audio/mp4',
  mp3:  'audio/mp3',
  wav:  'audio/wav',
  m4a:  'audio/mp4',
};

function detectMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? 'webm';
  return MIME_MAP[ext] ?? 'audio/webm';
}

const PROMPT_AUDIO = (mimeType: string) => `Você vai analisar um áudio em português brasileiro.

Faça DUAS coisas e retorne SOMENTE um JSON (sem markdown, sem texto extra):

1. Transcreva o áudio fielmente
2. Se a transcrição contiver um gasto ou receita:
   Retorne: {"transcricao":"...","tipo":"despesa","valor":50.00,"descricao":"iFood pizza","categoria":"Delivery","data":"${HOJE()}","hora":null,"metodo_pagamento":"pix","parcelas":null,"local":null,"banco":null}

3. Se NÃO contiver transação financeira:
   Retorne: {"transcricao":"...","erro":"sem transação identificada"}

Categorias: Alimentação, Mercado, Transporte, Saúde, Educação, Lazer, Roupas, Moradia, Assinaturas, Contas, Pet, Beleza, Presentes, Farmácia, Delivery, Salário, Freelance, Rendimentos, Outros.
metodo_pagamento: "pix" | "credito" | "debito" | "dinheiro" | "nao_informado"

RESPONDA APENAS JSON.`;

const PROMPT_CONVERSA = (transcricao: string) => `Você é o assistente financeiro do FinanceiroIA.
Responda em português brasileiro de forma amigável e concisa (máx. 3 parágrafos).
Ajude com finanças pessoais, orçamento e investimentos.

O usuário disse (via áudio): "${transcricao}"`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const requestedModel = String(formData.get('aiModel') || 'automatico');

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            requestedModel !== 'automatico' && requestedModel !== 'gemini'
              ? 'O modelo escolhido não processa áudio diretamente e o fallback multimodal está indisponível agora.'
              : 'A IA para áudio está indisponível no momento. Tente outro recurso ou ajuste sua configuração.',
        },
        { status: 503 },
      );
    }
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'audio obrigatório' }, { status: 400 });
    }

    const mimeType = detectMime(audioFile);
    const buffer   = Buffer.from(await audioFile.arrayBuffer());
    const base64   = buffer.toString('base64');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.1, maxOutputTokens: 768 },
    });

    // Envia áudio + prompt combinado (transcrição + extração em uma chamada)
    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      PROMPT_AUDIO(mimeType),
    ]);

    const raw   = result.response.text().trim();
    const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({
        tipo: 'conversa',
        transcricao: '',
        resposta: 'Não consegui processar o áudio. Tente falar mais perto do microfone.',
      } satisfies RespostaAssistente);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return NextResponse.json({
        tipo: 'conversa',
        transcricao: '',
        resposta: 'Não consegui interpretar o áudio.',
      } satisfies RespostaAssistente);
    }

    const transcricao = String(parsed.transcricao ?? '').trim();

    if (!transcricao) {
      return NextResponse.json({
        tipo: 'conversa',
        transcricao: '',
        resposta: 'Não consegui ouvir o áudio. Tente falar mais perto do microfone.',
      } satisfies RespostaAssistente);
    }

    // Verifica se tem transação (tem "valor" no JSON)
    const extractResult = parseTransacaoJSON(JSON.stringify(parsed));

    if ('valor' in extractResult) {
      const tx = extractResult;
      const resposta = tx.tipo === 'despesa'
        ? `Ouvi: *"${transcricao}"*\n\nEncontrei uma **despesa** de R$ ${tx.valor.toFixed(2).replace('.', ',')}. Confira e confirme.`
        : `Ouvi: *"${transcricao}"*\n\nEncontrei uma **receita** de R$ ${tx.valor.toFixed(2).replace('.', ',')}. Confira e confirme.`;

      return NextResponse.json({
        tipo: 'transacao',
        transacao: tx,
        transcricao,
        resposta,
        providerUsed: 'gemini',
      } satisfies RespostaAssistente);
    }

    // Fallback conversacional
    const modelConversa = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.7, maxOutputTokens: 384 },
    });
    const chatResult = await modelConversa.generateContent(PROMPT_CONVERSA(transcricao));

    return NextResponse.json({
      tipo: 'conversa',
      transcricao,
      resposta: chatResult.response.text().trim()
        || 'Entendi o áudio mas não identifiquei um gasto. Descreva com valor e o que foi gasto.',
      providerUsed: 'gemini',
    } satisfies RespostaAssistente);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[assistente/audio]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
