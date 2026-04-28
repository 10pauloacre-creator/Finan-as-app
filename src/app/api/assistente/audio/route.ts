import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { writeFileSync, unlinkSync, createReadStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseTransacaoJSON } from '../texto/route';
import type { RespostaAssistente } from '../texto/route';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const HOJE = () => new Date().toISOString().split('T')[0];

const SYSTEM_EXTRACAO = `Você é um extrator de transações financeiras. Analise a transcrição de áudio e decida:

CASO 1 — contém gasto ou receita → responda SOMENTE com JSON (sem texto adicional):
{"tipo":"despesa","valor":200,"descricao":"Manutenção geladeira","categoria":"Moradia","data":"${new Date().toISOString().split('T')[0]}","hora":null,"metodo_pagamento":"pix","parcelas":null,"local":null,"banco":"Itaú"}

CASO 2 — não contém gasto/receita → responda SOMENTE:
{"erro":"motivo breve"}

Campos obrigatórios: tipo (despesa|receita), valor (number), descricao, categoria, data (YYYY-MM-DD).
Opcionais (null se não informado): hora (HH:MM), metodo_pagamento (pix|credito|debito|dinheiro|nao_informado), parcelas, local, banco.
Categorias: Alimentação, Mercado, Transporte, Saúde, Educação, Lazer, Roupas, Moradia, Assinaturas, Contas, Pet, Beleza, Presentes, Farmácia, Delivery, Salário, Freelance, Rendimentos, Outros.
Data não informada → use hoje. RESPONDA APENAS JSON, sem texto adicional.`;

const SYSTEM_CONVERSA = `Você é o assistente financeiro do FinanceiroIA.
Responda em português brasileiro de forma amigável e concisa (máx. 3 parágrafos).
Ajude com finanças pessoais, orçamento e investimentos.`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let tmpFile: string | null = null;

  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'audio obrigatório' }, { status: 400 });
    }

    // Salva em arquivo temporário
    const ext = audioFile.type.includes('mp4') ? 'mp4'
               : audioFile.type.includes('ogg') ? 'ogg'
               : 'webm';
    tmpFile = join(tmpdir(), `assistente-audio-${Date.now()}.${ext}`);
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    writeFileSync(tmpFile, buffer);

    // 1. Transcreve com Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: createReadStream(tmpFile) as unknown as File,
      model: 'whisper-large-v3',
      language: 'pt',
      response_format: 'text',
    });
    const transcricao = typeof transcription === 'string'
      ? transcription
      : (transcription as { text: string }).text;

    if (!transcricao?.trim()) {
      return NextResponse.json({
        tipo: 'conversa',
        transcricao: '',
        resposta: 'Não consegui ouvir o áudio. Tente falar mais perto do microfone.',
      } satisfies RespostaAssistente);
    }

    // 2. Extrai transação da transcrição
    const extractRaw = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 512,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_EXTRACAO },
        { role: 'user',   content: transcricao },
      ],
    });

    const extractResult = parseTransacaoJSON(
      extractRaw.choices[0]?.message?.content?.trim() ?? '',
    );

    // Usa 'valor' in para checar sucesso (evita falso negativo por erro:null)
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
      } satisfies RespostaAssistente);
    }

    // 3. Fallback conversacional
    const chatRaw = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 384,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_CONVERSA },
        { role: 'user',   content: transcricao },
      ],
    });

    return NextResponse.json({
      tipo: 'conversa',
      transcricao,
      resposta: chatRaw.choices[0]?.message?.content?.trim()
        ?? 'Entendi o áudio mas não identifiquei um gasto. Descreva com valor e o que foi gasto.',
    } satisfies RespostaAssistente);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[assistente/audio]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (tmpFile) try { unlinkSync(tmpFile); } catch { /* ignora */ }
  }
}
