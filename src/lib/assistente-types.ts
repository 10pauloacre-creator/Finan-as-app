export interface TransacaoExtraida {
  tipo: 'despesa' | 'receita';
  valor: number;
  descricao: string;
  categoria: string;
  data: string;
  hora?: string | null;
  metodo_pagamento: 'pix' | 'credito' | 'debito' | 'dinheiro' | 'nao_informado';
  parcelas?: number | null;
  local?: string | null;
  banco?: string | null;
}

export interface RespostaAssistente {
  tipo: 'transacao' | 'conversa';
  transacao?: TransacaoExtraida;
  transcricao?: string;
  resposta: string;
}

export function parseTransacaoJSON(raw: string): TransacaoExtraida | { erro: string } {
  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return { erro: 'Resposta inválida da IA' };
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (parsed.erro && typeof parsed.erro === 'string' && parsed.erro.length > 0) {
      return { erro: parsed.erro };
    }
    if (!parsed.valor || !parsed.descricao || !parsed.tipo) {
      return { erro: 'Dados insuficientes na resposta.' };
    }
    delete parsed.erro;
    return parsed as unknown as TransacaoExtraida;
  } catch {
    return { erro: 'Não consegui interpretar a resposta.' };
  }
}
