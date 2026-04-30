import type { Transacao, Categoria, ContaBancaria, CartaoCredito } from '@/types';
import { formatarMoeda } from './storage';

interface DadosContexto {
  transacoes: Transacao[];
  categorias: Categoria[];
  contas: ContaBancaria[];
  cartoes: CartaoCredito[];
}

export function construirContexto(dados: DadosContexto): string {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();

  const txMes = dados.transacoes.filter(t => {
    const d = new Date(t.data + 'T00:00:00');
    return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual;
  });

  const despesasMes = txMes.filter(t => t.tipo === 'despesa');
  const receitasMes = txMes.filter(t => t.tipo === 'receita');
  const totalDespesas = despesasMes.reduce((s, t) => s + t.valor, 0);
  const totalReceitas = receitasMes.reduce((s, t) => s + t.valor, 0);

  // Group by category
  const porCategoria = new Map<string, number>();
  for (const t of despesasMes) {
    porCategoria.set(t.categoria_id, (porCategoria.get(t.categoria_id) ?? 0) + t.valor);
  }

  // Top 5 categories
  const topCats = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([catId, valor]) => {
      const cat = dados.categorias.find(c => c.id === catId);
      return `${cat?.nome ?? catId}: ${formatarMoeda(valor)}`;
    });

  // Recent transactions (last 10)
  const recentes = dados.transacoes
    .slice(0, 10)
    .map(t => {
      const cat = dados.categorias.find(c => c.id === t.categoria_id);
      return `${t.data} | ${t.tipo === 'despesa' ? '-' : '+'}${formatarMoeda(t.valor)} | ${t.descricao} | ${cat?.nome ?? ''}`;
    });

  // Account balances
  const saldos = dados.contas
    .map(c => `${c.nome}: ${formatarMoeda(c.saldo)}`)
    .join(', ');

  // Card bills
  const faturas = dados.cartoes
    .map(c => `${c.nome}: fatura ${formatarMoeda(c.fatura_atual)} / limite ${formatarMoeda(c.limite)}`)
    .join(', ');

  const mesNome = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return [
    `=== Resumo Financeiro — ${mesNome} ===`,
    `Total despesas: ${formatarMoeda(totalDespesas)}`,
    `Total receitas: ${formatarMoeda(totalReceitas)}`,
    `Saldo do mês: ${formatarMoeda(totalReceitas - totalDespesas)}`,
    ``,
    `Top categorias de gasto:`,
    ...topCats.map(c => `  - ${c}`),
    ``,
    `Últimas 10 transações:`,
    ...recentes.map(r => `  ${r}`),
    saldos ? `\nContas bancárias: ${saldos}` : '',
    faturas ? `Cartões: ${faturas}` : '',
  ].filter(Boolean).join('\n');
}
