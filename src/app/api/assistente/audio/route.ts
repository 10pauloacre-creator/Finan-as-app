import { NextRequest, NextResponse } from 'next/server';
import { parseTransacaoJSON } from '@/lib/assistente-types';
import type { RespostaAssistente } from '@/lib/assistente-types';
import type { AIModelId } from '@/lib/ai/aiModels';
import { runAI } from '@/lib/ai/aiService';
import { callOpenRouterAudio } from '@/lib/ai/providers/openRouterProvider';

const HOJE = () => new Date().toISOString().split('T')[0];

const PROMPT_EXTRACAO = (transcricao: string) => `Voce e um extrator de transacoes financeiras.
Analise a transcricao abaixo e decida:

CASO 1 - contem gasto ou receita: responda somente com JSON
{"tipo":"despesa","valor":50.00,"descricao":"iFood pizza","categoria":"Delivery","data":"${HOJE()}","hora":null,"metodo_pagamento":"pix","parcelas":null,"local":null,"banco":null}

CASO 2 - nao contem transacao financeira:
{"erro":"sem transacao identificada"}

Transcricao:
${transcricao}`;

function isMultipart(req: NextRequest) {
  return req.headers.get('content-type')?.toLowerCase().includes('multipart/form-data') ?? false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isMultipart(req)) {
    return NextResponse.json({ error: 'Envie o audio como multipart/form-data.' }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Nao foi possivel ler o audio enviado.' }, { status: 400 });
  }

  const audioFile = formData.get('audio');
  const aiModel = String(formData.get('aiModel') || 'automatico') as AIModelId;

  if (!(audioFile instanceof File)) {
    return NextResponse.json({ error: 'audio obrigatorio' }, { status: 400 });
  }

  if (!audioFile.type.startsWith('audio/')) {
    return NextResponse.json({ error: 'Formato de audio invalido.' }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json(
      { error: 'O processamento de audio ainda nao esta disponivel nesta configuracao.' },
      { status: 503 },
    );
  }

  try {
    const base64 = Buffer.from(await audioFile.arrayBuffer()).toString('base64');
    const transcription = await callOpenRouterAudio({
      providerId: 'openrouterFast',
      system: 'Voce transcreve audio em portugues do Brasil.',
      prompt: 'Transcreva este audio em portugues do Brasil.',
      temperature: 0,
      maxTokens: 256,
      attachment: {
        mimeType: audioFile.type || 'audio/wav',
        data: base64,
        fileName: audioFile.name,
      },
    });

    const transcricao = transcription.content.trim();
    if (!transcricao) {
      return NextResponse.json({
        tipo: 'conversa',
        transcricao: '',
        resposta: 'Nao consegui ouvir o audio. Tente falar mais perto do microfone.',
        providerUsed: 'openrouter',
      } satisfies RespostaAssistente);
    }

    const extraction = await runAI({
      task: 'categorizar_transacao',
      provider: aiModel,
      mode: aiModel !== 'automatico' ? 'manual' : 'auto',
      input: {
        customPrompt: PROMPT_EXTRACAO(transcricao),
      },
      options: { temperature: 0.1, maxTokens: 512 },
    });

    if (extraction.success && extraction.answer) {
      const parsed = parseTransacaoJSON(extraction.answer);
      if ('valor' in parsed) {
        const resposta = parsed.tipo === 'despesa'
          ? `Ouvi: *"${transcricao}"*\n\nEncontrei uma **despesa** de R$ ${parsed.valor.toFixed(2).replace('.', ',')}. Confira e confirme.`
          : `Ouvi: *"${transcricao}"*\n\nEncontrei uma **receita** de R$ ${parsed.valor.toFixed(2).replace('.', ',')}. Confira e confirme.`;

        return NextResponse.json({
          tipo: 'transacao',
          transacao: parsed,
          transcricao,
          resposta,
          providerUsed: extraction.providerUsed || 'openrouter',
        } satisfies RespostaAssistente);
      }
    }

    const conversation = await runAI({
      task: 'responder_pergunta_financeira',
      provider: aiModel,
      mode: aiModel !== 'automatico' ? 'manual' : 'auto',
      input: {
        customPrompt: `Voce e o assistente financeiro do FinanceiroIA.
Responda em portugues do Brasil de forma amigavel e concisa.

O usuario disse via audio:
${transcricao}`,
      },
      options: { temperature: 0.3, maxTokens: 384 },
    });

    return NextResponse.json({
      tipo: 'conversa',
      transcricao,
      resposta: conversation.answer?.trim() || 'Entendi o audio, mas nao identifiquei uma transacao financeira clara.',
      providerUsed: conversation.providerUsed || 'openrouter',
    } satisfies RespostaAssistente);
  } catch {
    return NextResponse.json(
      { error: 'Nao foi possivel processar o audio agora. Tente novamente em instantes.' },
      { status: 503 },
    );
  }
}
