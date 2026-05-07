interface SnapshotCartao {
  id: string;
  nome: string;
  banco: string;
  limite: number;
  faturaAtual: number;
  diaFechamento: number;
  diaVencimento: number;
}

interface SnapshotFinanceiroMinimo {
  cartoes?: SnapshotCartao[];
  contas?: Array<{ id: string; nome: string; banco: string; saldo: number }>;
  metas?: Array<{ id: string; descricao: string; valorAlvo: number; valorAtual: number }>;
  orcamentos?: Array<{ id: string; categoriaNome: string; valorLimite: number; gastoAtual: number }>;
  resumoMensal?: {
    totalDespesas: number;
    totalReceitas: number;
    saldoMes: number;
    quantidadeTransacoes: number;
  };
  categoriasTop?: Array<{ categoriaNome: string; valor: number }>;
  transacoesRecentes?: Array<{ data: string; descricao: string; valor: number; tipo: string; categoriaNome: string }>;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isCardPurchaseListRequest(question: string, snapshot?: SnapshotFinanceiroMinimo | null) {
  const normalized = normalizeText(question);
  const hasCardMention = normalized.includes('cartao') || normalized.includes('credito') || normalized.includes('fatura');
  const hasListShape = question.includes('\n') || (question.match(/r\$/gi) || []).length > 1;
  const hasShoppingHint =
    normalized.includes('mercado') ||
    normalized.includes('feira') ||
    normalized.includes('mantimentos') ||
    normalized.includes('nota fiscal') ||
    normalized.includes('compras do dia') ||
    normalized.includes('lista de compra');

  return Boolean(snapshot?.cartoes?.length) && hasCardMention && (hasListShape || hasShoppingHint);
}

export function buildCardPurchasePrompt(question: string, snapshot?: SnapshotFinanceiroMinimo | null) {
  return `Voce vai estruturar uma compra feita no cartao com base em uma lista textual enviada pelo usuario.
Use os cartoes disponiveis do projeto para sugerir o cartao correto quando houver correspondencia por nome, banco ou apelido.

Cartoes disponiveis:
${JSON.stringify(snapshot?.cartoes || [], null, 2)}

Retorne apenas JSON valido neste formato:
{
  "modo": "compra_cartao",
  "cartao_id_sugerido": "string | null",
  "cartao_nome_sugerido": "string | null",
  "transacao": {
    "tipo": "despesa",
    "valor": 0,
    "descricao": "",
    "categoria": "Feira de mantimentos",
    "data": "YYYY-MM-DD",
    "hora": "HH:mm | null",
    "metodo_pagamento": "credito",
    "parcelas": null,
    "local": "",
    "banco": "",
    "observacoes": "",
    "itens_compra": [
      { "nome": "", "valor": 0, "quantidade": 1, "unidade": "un | kg | l | null" }
    ]
  }
}

Regras:
- Use categoria "Feira de mantimentos" quando for compra de mercado, feira, hortifruti ou nota fiscal de mantimentos.
- Some os itens para gerar o valor total quando ele nao vier pronto.
- Se a data nao estiver clara, use a data de hoje.
- Se o horario nao estiver claro, use null.
- Se nao houver correspondencia segura de cartao, deixe cartao_id_sugerido e cartao_nome_sugerido como null.
- Nao invente itens nem valores.
- Responda apenas com JSON.

Texto do usuario:
${question}`;
}

export function buildAutomationPrompt(snapshot?: SnapshotFinanceiroMinimo | null, question?: string) {
  return `Voce esta conectado internamente ao projeto FinanceiroIA.
Analise os dados estruturados do projeto, cruze informacoes entre transacoes, cartoes, contas, metas e orcamentos e retorne apenas JSON valido.

Formato:
{
  "resumo": "string curta",
  "acoes_sugeridas": [
    {
      "tipo": "alerta_orcamento" | "sugerir_reserva" | "acompanhar_meta" | "revisar_cartao" | "conciliar_gasto" | "classificar_pendencia",
      "titulo": "",
      "descricao": "",
      "prioridade": "alta" | "media" | "baixa"
    }
  ],
  "automacoes_prontas": [
    {
      "tipo": "monitoramento" | "lembrete" | "revisao",
      "descricao": ""
    }
  ]
}

Dados do projeto:
${JSON.stringify(snapshot || {}, null, 2)}

Pedido adicional do usuario:
${question || 'Analise geral do projeto e sugira automacoes internas seguras.'}`;
}

export function normalizeSuggestedCard<T extends { cartao_id_sugerido?: unknown; cartao_nome_sugerido?: unknown }>(
  payload: T,
  snapshot?: SnapshotFinanceiroMinimo | null,
) {
  if (!snapshot?.cartoes?.length) {
    return {
      cardId: null,
      cardName: null,
    };
  }

  const requestedId = typeof payload.cartao_id_sugerido === 'string' ? payload.cartao_id_sugerido : '';
  const requestedName = typeof payload.cartao_nome_sugerido === 'string' ? payload.cartao_nome_sugerido : '';
  const normalizedRequested = normalizeText(`${requestedId} ${requestedName}`);

  const exactById = snapshot.cartoes.find((card) => card.id === requestedId);
  if (exactById) {
    return { cardId: exactById.id, cardName: exactById.nome };
  }

  const matched = snapshot.cartoes.find((card) => {
    const haystack = normalizeText(`${card.id} ${card.nome} ${card.banco}`);
    return normalizedRequested && haystack.includes(normalizedRequested);
  });

  if (matched) {
    return { cardId: matched.id, cardName: matched.nome };
  }

  return {
    cardId: null,
    cardName: requestedName || null,
  };
}
