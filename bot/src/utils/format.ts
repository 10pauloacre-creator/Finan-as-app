import { TransacaoBot } from '../state';

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarData(data: string): string {
  try {
    return new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return data;
  }
}

const METODO_LABEL: Record<string, string> = {
  pix:          'Pix',
  credito:      'Crédito',
  debito:       'Débito',
  dinheiro:     'Dinheiro',
  nao_informado: 'Não informado',
};

export function confirmarMsg(t: TransacaoBot): string {
  const linhas = [
    `💳 *Valor:* ${formatarMoeda(t.valor)}`,
    `📂 *Categoria:* ${t.categoria}`,
    `📝 *Descrição:* ${t.descricao}`,
    `📅 *Data:* ${formatarData(t.data)}`,
    t.hora       ? `⏰ *Hora:* ${t.hora}`                                 : null,
    `💰 *Pagamento:* ${METODO_LABEL[t.metodo_pagamento] || t.metodo_pagamento}`,
    t.banco      ? `🏦 *Banco:* ${t.banco}`                               : null,
    t.parcelas   ? `🔢 *Parcelas:* ${t.parcelas}x`                        : null,
    t.local      ? `📍 *Local:* ${t.local}`                               : null,
  ];
  return linhas.filter(Boolean).join('\n');
}
