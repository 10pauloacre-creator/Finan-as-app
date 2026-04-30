import type { Transacao, Orcamento, ContaBancaria, CartaoCredito, Meta } from '@/types';

export interface FatorScore {
  nome: string;
  pontos: number;     // achieved
  maximo: number;     // max possible
  descricao: string;  // short explanation
}

export interface ScoreFinanceiro {
  total: number;       // 0-100
  nivel: 'critico' | 'atencao' | 'bom' | 'otimo';
  fatores: FatorScore[];
}

interface DadosScore {
  transacoes: Transacao[];
  orcamentos: Orcamento[];
  contas: ContaBancaria[];
  cartoes: CartaoCredito[];
  metas: Meta[];
}

export function calcularScore(dados: DadosScore): ScoreFinanceiro {
  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  const ano = hoje.getFullYear();

  const txMes = dados.transacoes.filter(t => {
    const d = new Date(t.data + 'T00:00:00');
    return d.getMonth() + 1 === mes && d.getFullYear() === ano;
  });

  const totalReceitas  = txMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
  const totalDespesas  = txMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
  const saldoTotal     = dados.contas.reduce((s, c) => s + c.saldo, 0);
  const faturaTotal    = dados.cartoes.reduce((s, c) => s + c.fatura_atual, 0);
  const limiteTotal    = dados.cartoes.reduce((s, c) => s + c.limite, 0);

  const fatores: FatorScore[] = [];

  // 1. Equilíbrio receita/despesa — 30 pts
  let ptBalance = 0;
  if (totalReceitas > 0) {
    const ratio = (totalReceitas - totalDespesas) / totalReceitas;
    ptBalance = Math.round(Math.min(30, Math.max(0, ratio * 30 / 0.3))); // full 30pts at 30% savings
  } else if (totalDespesas === 0) {
    ptBalance = 15; // no data yet — neutral
  }
  fatores.push({
    nome: 'Equilíbrio financeiro',
    pontos: ptBalance,
    maximo: 30,
    descricao: totalReceitas > 0
      ? `Você está gastando ${((totalDespesas / totalReceitas) * 100).toFixed(0)}% da sua renda`
      : 'Registre suas receitas para calcular',
  });

  // 2. Cumprimento de orçamentos — 20 pts
  const orcMes = dados.orcamentos.filter(o => o.mes === mes && o.ano === ano);
  let ptOrc = 20;
  if (orcMes.length > 0) {
    let violacoes = 0;
    for (const o of orcMes) {
      const gasto = txMes
        .filter(t => t.tipo === 'despesa' && t.categoria_id === o.categoria_id)
        .reduce((s, t) => s + t.valor, 0);
      if (gasto > o.valor_limite) violacoes++;
    }
    ptOrc = Math.round(20 * (1 - violacoes / orcMes.length));
  }
  fatores.push({
    nome: 'Orçamentos no limite',
    pontos: ptOrc,
    maximo: 20,
    descricao: orcMes.length === 0
      ? 'Defina orçamentos por categoria para pontuar aqui'
      : `${orcMes.length - Math.round((20 - ptOrc) / 20 * orcMes.length)} de ${orcMes.length} categorias dentro do limite`,
  });

  // 3. Reserva de emergência — 20 pts (3x monthly expenses = max)
  let ptReserva = 0;
  if (totalDespesas > 0) {
    ptReserva = Math.round(Math.min(20, (saldoTotal / (totalDespesas * 3)) * 20));
  } else if (saldoTotal > 0) {
    ptReserva = 10;
  }
  fatores.push({
    nome: 'Reserva de emergência',
    pontos: ptReserva,
    maximo: 20,
    descricao: saldoTotal > 0
      ? `Saldo total: R$ ${saldoTotal.toFixed(2).replace('.', ',')}`
      : 'Mantenha pelo menos 3x seus gastos mensais em conta',
  });

  // 4. Metas ativas — 10 pts
  const metasAtivas = dados.metas.filter(m => m.valor_atual < m.valor_alvo);
  const metasComProgresso = metasAtivas.filter(m => m.valor_atual / m.valor_alvo >= 0.1);
  const ptMetas = metasAtivas.length === 0 ? 5 : Math.min(10, metasComProgresso.length * 5);
  fatores.push({
    nome: 'Metas financeiras',
    pontos: ptMetas,
    maximo: 10,
    descricao: metasAtivas.length === 0
      ? 'Crie metas financeiras para atingir seus objetivos'
      : `${metasAtivas.length} meta${metasAtivas.length > 1 ? 's' : ''} ativa${metasAtivas.length > 1 ? 's' : ''}`,
  });

  // 5. Uso do cartão de crédito — 10 pts
  let ptCartao = 10;
  if (limiteTotal > 0) {
    const utilizacao = faturaTotal / limiteTotal;
    ptCartao = Math.round(Math.max(0, 10 - utilizacao * 10 / 0.7)); // 0pts at 70%+ utilization
  }
  fatores.push({
    nome: 'Uso do crédito',
    pontos: ptCartao,
    maximo: 10,
    descricao: limiteTotal > 0
      ? `Utilizando ${((faturaTotal / limiteTotal) * 100).toFixed(0)}% do limite disponível`
      : 'Nenhum cartão cadastrado',
  });

  // 6. Diversificação — 10 pts (has both income and has investments or savings goal)
  const temReceita = totalReceitas > 0;
  const temInvestimentoOuMeta = dados.metas.length > 0;
  const ptDiv = temReceita && temInvestimentoOuMeta ? 10 : temReceita ? 5 : 0;
  fatores.push({
    nome: 'Planejamento futuro',
    pontos: ptDiv,
    maximo: 10,
    descricao: temInvestimentoOuMeta ? 'Você tem metas ou investimentos ativos' : 'Crie metas de poupança ou investimentos',
  });

  const total = fatores.reduce((s, f) => s + f.pontos, 0);
  const nivel: ScoreFinanceiro['nivel'] =
    total >= 80 ? 'otimo' :
    total >= 60 ? 'bom' :
    total >= 40 ? 'atencao' : 'critico';

  return { total, nivel, fatores };
}
