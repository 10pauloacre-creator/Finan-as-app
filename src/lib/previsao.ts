import type { Transacao } from '@/types';
import { detectarAssinaturas } from './assinaturas';
import { diffDaysBetween, parseFinancialDate, startOfTodayLocal } from './date';

export interface GastoPrevisto {
  data: string;           // YYYY-MM-DD
  descricao: string;
  valor: number;
  categoria_id: string;
  tipo: 'assinatura' | 'recorrente' | 'futura';
  diasRestantes: number;
}

export function calcularPrevisao(transacoes: Transacao[], diasFuturos = 30): GastoPrevisto[] {
  const hoje = startOfTodayLocal();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + diasFuturos);

  const assinaturas = detectarAssinaturas(transacoes);
  const previsoes: GastoPrevisto[] = [];
  const chaves = new Set<string>();

  const registrarPrevisao = (previsao: GastoPrevisto) => {
    const chave = `${previsao.tipo}:${previsao.data}:${previsao.descricao}:${previsao.valor}`;
    if (chaves.has(chave)) return;
    chaves.add(chave);
    previsoes.push(previsao);
  };

  for (const transacao of transacoes) {
    if (transacao.tipo !== 'despesa' || transacao.classificacao !== 'futura') continue;

    const dataTransacao = parseFinancialDate(transacao.data);
    if (dataTransacao < hoje || dataTransacao > limite) continue;

    registrarPrevisao({
      data: transacao.data,
      descricao: transacao.descricao,
      valor: transacao.valor,
      categoria_id: transacao.categoria_id,
      tipo: 'futura',
      diasRestantes: diffDaysBetween(dataTransacao, hoje),
    });
  }

  for (const ass of assinaturas) {
    const proxData = parseFinancialDate(ass.proximaEstimada);
    if (proxData >= hoje && proxData <= limite) {
      registrarPrevisao({
        data: ass.proximaEstimada,
        descricao: ass.descricaoOriginal,
        valor: ass.valor,
        categoria_id: ass.categoria_id,
        tipo: 'assinatura',
        diasRestantes: diffDaysBetween(proxData, hoje),
      });
    }
  }

  for (const transacao of transacoes) {
    if (transacao.tipo !== 'despesa' || transacao.classificacao !== 'fixa') continue;

    const base = parseFinancialDate(transacao.data);
    let proxima = new Date(hoje.getFullYear(), hoje.getMonth(), base.getDate());
    if (proxima < hoje) {
      proxima = new Date(hoje.getFullYear(), hoje.getMonth() + 1, base.getDate());
    }
    if (proxima < hoje || proxima > limite) continue;

    registrarPrevisao({
      data: [
        proxima.getFullYear(),
        String(proxima.getMonth() + 1).padStart(2, '0'),
        String(proxima.getDate()).padStart(2, '0'),
      ].join('-'),
      descricao: transacao.descricao,
      valor: transacao.valor,
      categoria_id: transacao.categoria_id,
      tipo: 'recorrente',
      diasRestantes: diffDaysBetween(proxima, hoje),
    });
  }

  return previsoes.sort((a, b) => a.data.localeCompare(b.data));
}
