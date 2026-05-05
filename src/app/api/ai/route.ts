import { AIModelId } from '@/lib/ai/catalog';
import { generateTextWithFallback } from '@/lib/ai/text';

function sanitizeFinancialData(data: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? {});

  return text
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[CPF_REMOVIDO]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_REMOVIDO]')
    .replace(/\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/g, '[TELEFONE_REMOVIDO]')
    .replace(/ag[eê]ncia[:\s-]*[\w.-]+/gi, 'agência [REMOVIDA]')
    .replace(/conta[:\s-]*[\w.-]+/gi, 'conta [REMOVIDA]')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [TOKEN_REMOVIDO]')
    .replace(/\b(?:hf|sk|gsk|pk|rk)_[a-z0-9_-]{8,}\b/gi, '[TOKEN_REMOVIDO]')
    .slice(0, 6000);
}

export async function POST(req: Request) {
  try {
    const {
      question,
      financialContext,
      aiModel,
    } = await req.json() as {
      question?: string;
      financialContext?: unknown;
      aiModel?: AIModelId;
    };

    if (!question?.trim()) {
      return Response.json({ error: 'Pergunta não enviada.' }, { status: 400 });
    }

    const safeContext = sanitizeFinancialData(financialContext || {});
    const result = await generateTextWithFallback({
      task: 'chat',
      preferredModel: aiModel || 'automatico',
      temperature: 0.3,
      maxTokens: 800,
      system: [
        'Você é um assistente financeiro pessoal.',
        'Responda em português do Brasil.',
        'Não invente valores.',
        'Não peça CPF, senha, token bancário, agência ou número de conta.',
        'Use apenas os dados fornecidos.',
        'Dê sugestões práticas e conservadoras.',
      ].join('\n'),
      user: [
        'Contexto financeiro:',
        safeContext || 'Sem contexto adicional.',
        '',
        'Pergunta:',
        question,
      ].join('\n'),
    });

    return Response.json({
      answer: result.content || 'Sem resposta.',
      resposta: result.content || 'Sem resposta.',
      providerUsed: result.providerUsed,
    });
  } catch (error) {
    console.error(error);

    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    const lower = message.toLowerCase();
    const status = lower.includes('rate') || lower.includes('429') ? 429 : 500;
    const friendlyMessage =
      lower.includes('hf_token') || lower.includes('api key') || lower.includes('indisponível')
        ? 'A configuração de IA não está pronta ou um provedor está indisponível agora. Tente novamente em instantes.'
        : status === 429
        ? 'A IA está temporariamente ocupada por limite de uso. Tente novamente daqui a pouco.'
        : 'Não foi possível consultar a IA agora. Tente novamente em instantes.';

    return Response.json(
      { error: friendlyMessage },
      { status }
    );
  }
}
