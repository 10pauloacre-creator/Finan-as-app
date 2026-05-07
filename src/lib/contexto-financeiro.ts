import type {
  Transacao,
  Categoria,
  ContaBancaria,
  CartaoCredito,
  Investimento,
  Meta,
  Orcamento,
} from '@/types';
import { formatarMoeda } from './storage';
import { isSameFinancialMonth } from './date';

interface DadosContexto {
  transacoes: Transacao[];
  categorias: Categoria[];
  contas: ContaBancaria[];
  cartoes: CartaoCredito[];
  investimentos?: Investimento[];
  metas?: Meta[];
  orcamentos?: Orcamento[];
}

export interface SnapshotFinanceiro {
  referencia: {
    mes: number;
    ano: number;
    mesNome: string;
  };
  resumoMensal: {
    totalDespesas: number;
    totalReceitas: number;
    saldoMes: number;
    quantidadeTransacoes: number;
  };
  categoriasTop: Array<{
    categoriaId: string;
    categoriaNome: string;
    valor: number;
  }>;
  transacoesRecentes: Array<{
    id: string;
    data: string;
    descricao: string;
    valor: number;
    tipo: string;
    categoriaId: string;
    categoriaNome: string;
    metodoPagamento?: string;
    cartaoId?: string;
    contaId?: string;
  }>;
  contas: Array<{
    id: string;
    nome: string;
    banco: string;
    tipo: string;
    saldo: number;
  }>;
  cartoes: Array<{
    id: string;
    nome: string;
    banco: string;
    limite: number;
    faturaAtual: number;
    diaFechamento: number;
    diaVencimento: number;
  }>;
  investimentos: Array<{
    id: string;
    nome: string;
    tipo: string;
    valorInvestido: number;
    valorAtual?: number;
  }>;
  metas: Array<{
    id: string;
    descricao: string;
    valorAlvo: number;
    valorAtual: number;
  }>;
  orcamentos: Array<{
    id: string;
    categoriaId: string;
    categoriaNome: string;
    valorLimite: number;
    gastoAtual: number;
  }>;
}

export function construirSnapshotFinanceiro(dados: DadosContexto): SnapshotFinanceiro {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();

  const txMes = dados.transacoes.filter((transacao) => isSameFinancialMonth(transacao.data, mesAtual, anoAtual));
  const despesasMes = txMes.filter((transacao) => transacao.tipo === 'despesa');
  const receitasMes = txMes.filter((transacao) => transacao.tipo === 'receita');
  const totalDespesas = despesasMes.reduce((soma, transacao) => soma + transacao.valor, 0);
  const totalReceitas = receitasMes.reduce((soma, transacao) => soma + transacao.valor, 0);

  const porCategoria = new Map<string, number>();
  for (const transacao of despesasMes) {
    porCategoria.set(transacao.categoria_id, (porCategoria.get(transacao.categoria_id) ?? 0) + transacao.valor);
  }

  const categoriasTop = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([categoriaId, valor]) => ({
      categoriaId,
      categoriaNome: dados.categorias.find((categoria) => categoria.id === categoriaId)?.nome ?? categoriaId,
      valor,
    }));

  const transacoesRecentes = [...dados.transacoes]
    .slice(0, 20)
    .map((transacao) => ({
      id: transacao.id,
      data: transacao.data,
      descricao: transacao.descricao,
      valor: transacao.valor,
      tipo: transacao.tipo,
      categoriaId: transacao.categoria_id,
      categoriaNome: dados.categorias.find((categoria) => categoria.id === transacao.categoria_id)?.nome ?? transacao.categoria_id,
      metodoPagamento: transacao.metodo_pagamento,
      cartaoId: transacao.cartao_id,
      contaId: transacao.conta_id,
    }));

  const orcamentos = (dados.orcamentos ?? []).map((orcamento) => ({
    id: orcamento.id,
    categoriaId: orcamento.categoria_id,
    categoriaNome: dados.categorias.find((categoria) => categoria.id === orcamento.categoria_id)?.nome ?? orcamento.categoria_id,
    valorLimite: orcamento.valor_limite,
    gastoAtual: despesasMes
      .filter((transacao) => transacao.categoria_id === orcamento.categoria_id)
      .reduce((soma, transacao) => soma + transacao.valor, 0),
  }));

  return {
    referencia: {
      mes: mesAtual,
      ano: anoAtual,
      mesNome: hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    },
    resumoMensal: {
      totalDespesas,
      totalReceitas,
      saldoMes: totalReceitas - totalDespesas,
      quantidadeTransacoes: txMes.length,
    },
    categoriasTop,
    transacoesRecentes,
    contas: dados.contas.map((conta) => ({
      id: conta.id,
      nome: conta.nome,
      banco: conta.banco,
      tipo: conta.tipo,
      saldo: conta.saldo,
    })),
    cartoes: dados.cartoes.map((cartao) => ({
      id: cartao.id,
      nome: cartao.nome,
      banco: cartao.banco,
      limite: cartao.limite,
      faturaAtual: cartao.fatura_atual,
      diaFechamento: cartao.dia_fechamento,
      diaVencimento: cartao.dia_vencimento,
    })),
    investimentos: (dados.investimentos ?? []).map((investimento) => ({
      id: investimento.id,
      nome: investimento.nome,
      tipo: investimento.tipo,
      valorInvestido: investimento.valor_investido,
      valorAtual: investimento.valor_atual,
    })),
    metas: (dados.metas ?? []).map((meta) => ({
      id: meta.id,
      descricao: meta.descricao,
      valorAlvo: meta.valor_alvo,
      valorAtual: meta.valor_atual,
    })),
    orcamentos,
  };
}

export function construirContexto(dados: DadosContexto): string {
  const snapshot = construirSnapshotFinanceiro(dados);

  const topCategorias = snapshot.categoriasTop.map((categoria) => `${categoria.categoriaNome}: ${formatarMoeda(categoria.valor)}`);
  const recentes = snapshot.transacoesRecentes.map((transacao) => (
    `${transacao.data} | ${transacao.tipo === 'despesa' ? '-' : '+'}${formatarMoeda(transacao.valor)} | ${transacao.descricao} | ${transacao.categoriaNome}`
  ));
  const saldos = snapshot.contas.map((conta) => `${conta.nome}: ${formatarMoeda(conta.saldo)}`).join(', ');
  const faturas = snapshot.cartoes.map((cartao) => `${cartao.nome}: fatura ${formatarMoeda(cartao.faturaAtual)} / limite ${formatarMoeda(cartao.limite)}`).join(', ');

  return [
    `=== Resumo Financeiro - ${snapshot.referencia.mesNome} ===`,
    `Total despesas: ${formatarMoeda(snapshot.resumoMensal.totalDespesas)}`,
    `Total receitas: ${formatarMoeda(snapshot.resumoMensal.totalReceitas)}`,
    `Saldo do mes: ${formatarMoeda(snapshot.resumoMensal.saldoMes)}`,
    '',
    'Top categorias de gasto:',
    ...topCategorias.map((categoria) => `  - ${categoria}`),
    '',
    'Ultimas 20 transacoes:',
    ...recentes.map((recente) => `  ${recente}`),
    saldos ? `Contas bancarias: ${saldos}` : '',
    faturas ? `Cartoes: ${faturas}` : '',
  ].filter(Boolean).join('\n');
}
