import type { Transacao } from '@/types';
import { detectarAssinaturas } from './assinaturas';

export interface GastoPrevisto {
  data: string;           // YYYY-MM-DD
  descricao: string;
  valor: number;
  categoria_id: string;
  tipo: 'assinatura' | 'recorrente';
  diasRestantes: number;
}

export function calcularPrevisao(transacoes: Transacao[], diasFuturos = 30): GastoPrevisto[] {
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + diasFuturos);

  const assinaturas = detectarAssinaturas(transacoes);
  const previsoes: GastoPrevisto[] = [];

  for (const ass of assinaturas) {
    const proxData = new Date(ass.proximaEstimada + 'T00:00:00');
    if (proxData >= hoje && proxData <= limite) {
      const diff = Math.round((proxData.getTime() - hoje.getTime()) / 86400000);
      previsoes.push({
        data: ass.proximaEstimada,
        descricao: ass.descricaoOriginal,
        valor: ass.valor,
        categoria_id: ass.categoria_id,
        tipo: 'assinatura',
        diasRestantes: diff,
      });
    }
  }

  return previsoes.sort((a, b) => a.data.localeCompare(b.data));
}
