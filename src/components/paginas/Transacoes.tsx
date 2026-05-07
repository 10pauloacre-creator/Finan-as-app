'use client';

import { useMemo, useState } from 'react';
import { Edit, Plus, Search, Trash2, X } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { ContaBancaria, CartaoCredito, Transacao } from '@/types';
import ModalNovaTransacao from '@/components/modais/ModalNovaTransacao';
import { isSameFinancialMonth, parseFinancialDate, startOfTodayLocal } from '@/lib/date';
import {
  calcularDataFinalParcelamento,
  calcularGastoRecorrenteAnual,
  calcularParcelamentoInfo,
  transacaoJaOcorreuAteData,
} from '@/lib/transacoes';

const FILTROS_TIPO = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'despesa', label: 'Despesas' },
  { valor: 'receita', label: 'Receitas' },
];

const DIAS_SEMANA_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type PeriodoFiltro = 'mes' | '3meses' | 'tudo';
type ClassificacaoFiltro = 'todas' | 'padrao' | 'fixa' | 'futura';

const FILTROS_CLASSIFICACAO: { valor: ClassificacaoFiltro; label: string }[] = [
  { valor: 'todas', label: 'Todas' },
  { valor: 'padrao', label: 'Normais' },
  { valor: 'fixa', label: 'Fixas' },
  { valor: 'futura', label: 'Futuras' },
];

function getClassificacaoTransacao(transacao: Transacao): Exclude<ClassificacaoFiltro, 'todas'> {
  return transacao.classificacao || 'padrao';
}

function getBadgeClassificacao(transacao: Transacao, hoje: Date) {
  const classificacao = getClassificacaoTransacao(transacao);
  const realizada = transacaoJaOcorreuAteData(transacao, hoje);

  if (classificacao === 'fixa') {
    return {
      label: transacao.tipo === 'receita'
        ? (realizada ? 'Receita recorrente' : 'Receita recorrente pendente')
        : (realizada ? 'Gasto recorrente' : 'Gasto recorrente pendente'),
      className: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
    };
  }

  if (classificacao === 'futura') {
    return {
      label: transacao.tipo === 'receita' ? 'Receita futura' : 'Gasto futuro',
      className: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    };
  }

  return null;
}

function formatarDataHeader(dataStr: string): string {
  const d = new Date(`${dataStr}T00:00:00`);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);

  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return `${DIAS_SEMANA_PT[d.getDay()]}, ${d.getDate()} ${MESES_PT[d.getMonth()]}`;
}

function getNomeConta(conta?: ContaBancaria) {
  if (!conta) return 'Sem conta vinculada';
  return `${conta.nome} • ${conta.tipo}`;
}

function getNomeCartao(cartao?: CartaoCredito) {
  if (!cartao) return 'Sem cartao vinculado';
  return `${cartao.nome} • ${cartao.bandeira}`;
}

function ModalDetalheTransacao({
  transacao,
  conta,
  cartao,
  categoriaNome,
  onEditar,
  onFechar,
}: {
  transacao: Transacao;
  conta?: ContaBancaria;
  cartao?: CartaoCredito;
  categoriaNome: string;
  onEditar: () => void;
  onFechar: () => void;
}) {
  const hoje = startOfTodayLocal();
  const parcelamento = calcularParcelamentoInfo(transacao, hoje);
  const gastoAnual = calcularGastoRecorrenteAnual(transacao);
  const dataFinalParcelamento = transacao.parcelas && transacao.parcelas > 1
    ? calcularDataFinalParcelamento(transacao)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl lg:rounded-2xl border border-slate-700 bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900 p-5">
          <div>
            <h3 className="text-lg font-bold text-white">{transacao.descricao}</h3>
            <p className="text-xs text-slate-500 mt-1">Detalhes completos do lancamento</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEditar}
              className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/20"
            >
              <Edit size={14} />
              Editar
            </button>
            <button onClick={onFechar} className="rounded-lg p-1 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-red-500/15 bg-red-500/5 p-3">
              <div className="text-[11px] text-slate-500">Valor total</div>
              <div className="mt-1 text-sm font-semibold text-red-400 tabular-nums">{formatarMoeda(transacao.valor)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Data</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {parseFinancialDate(transacao.data).toLocaleDateString('pt-BR')}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Categoria</div>
              <div className="mt-1 text-sm font-semibold text-white">{categoriaNome}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Classificacao</div>
              <div className="mt-1 text-sm font-semibold text-white capitalize">{getClassificacaoTransacao(transacao)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] text-slate-500">Forma de pagamento</div>
              <div className="mt-1 text-sm font-semibold text-white uppercase">
                {transacao.metodo_pagamento || 'Nao informado'}
              </div>
              <div className="mt-3 text-[11px] text-slate-500">Conta</div>
              <div className="mt-1 text-sm text-slate-200">{getNomeConta(conta)}</div>
              <div className="mt-3 text-[11px] text-slate-500">Cartao</div>
              <div className="mt-1 text-sm text-slate-200">{getNomeCartao(cartao)}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] text-slate-500">Origem</div>
              <div className="mt-1 text-sm font-semibold text-white">{transacao.origem}</div>
              <div className="mt-3 text-[11px] text-slate-500">Local</div>
              <div className="mt-1 text-sm text-slate-200">{transacao.local || 'Nao informado'}</div>
              <div className="mt-3 text-[11px] text-slate-500">Horario</div>
              <div className="mt-1 text-sm text-slate-200">{transacao.horario || 'Nao informado'}</div>
            </div>
          </div>

          {gastoAnual !== null && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="text-[11px] text-slate-500">Gasto anual estimado</div>
              <div className="mt-1 text-base font-semibold text-blue-300 tabular-nums">
                {formatarMoeda(gastoAnual)}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Como esta despesa e fixa/recorrente, o app projeta {formatarMoeda(transacao.valor)} por mes ao longo de 12 meses.
              </p>
            </div>
          )}

          {parcelamento && (
            <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <div className="text-[11px] text-slate-500">Parcelas</div>
                  <div className="mt-1 text-sm font-semibold text-white">{parcelamento.totalParcelas}x</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Ja ocorreu</div>
                  <div className="mt-1 text-sm font-semibold text-white">{parcelamento.parcelaAtual}x</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Faltam</div>
                  <div className="mt-1 text-sm font-semibold text-amber-300">{parcelamento.parcelasRestantes}x</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Valor restante</div>
                  <div className="mt-1 text-sm font-semibold text-white tabular-nums">{formatarMoeda(parcelamento.valorRestante)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Termina em</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {parcelamento.dataFinal.toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Valor medio por parcela: {formatarMoeda(parcelamento.valorParcela)}.
                {dataFinalParcelamento ? ` Ultima previsao em ${dataFinalParcelamento.toLocaleDateString('pt-BR')}.` : ''}
              </p>
            </div>
          )}

          {transacao.observacoes && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] text-slate-500">Observacoes</div>
              <p className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">{transacao.observacoes}</p>
            </div>
          )}

          {transacao.itens_compra && transacao.itens_compra.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] text-slate-500 mb-3">Itens da compra</div>
              <div className="space-y-2">
                {transacao.itens_compra.map((item, index) => (
                  <div key={`${item.nome}-${index}`} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                    <div className="text-sm text-white">{item.nome}</div>
                    <div className="text-sm text-slate-300 tabular-nums">
                      {item.valor !== null ? formatarMoeda(item.valor) : 'Sem valor'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Transacoes() {
  const { transacoes, categorias, contas, cartoes, excluirTransacao } = useFinanceiroStore();

  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth() + 1);
  const [filtroAno, setFiltroAno] = useState(new Date().getFullYear());
  const [periodo, setPeriodo] = useState<PeriodoFiltro>('mes');
  const [filtroClassificacao, setFiltroClassificacao] = useState<ClassificacaoFiltro>('todas');
  const [catSelecionada, setCatSelecionada] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [transacaoEditar, setTransacaoEditar] = useState<Transacao | undefined>();
  const [transacaoDetalhe, setTransacaoDetalhe] = useState<Transacao | null>(null);
  const hoje = startOfTodayLocal();

  const transacoesPorPeriodo = useMemo(() => {
    const agora = new Date();
    return transacoes.filter((t) => {
      if (periodo === 'mes') {
        return isSameFinancialMonth(t.data, filtroMes, filtroAno);
      }
      if (periodo === '3meses') {
        const tresMesesAtras = new Date(agora);
        tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 2);
        tresMesesAtras.setDate(1);
        return parseFinancialDate(t.data) >= tresMesesAtras;
      }
      return true;
    });
  }, [transacoes, periodo, filtroMes, filtroAno]);

  const chipsCategoria = useMemo(() => {
    const mapa: Record<string, { id: string; nome: string; icone: string; cor: string; total: number }> = {};
    transacoesPorPeriodo
      .filter((t) => t.tipo === 'despesa')
      .forEach((t) => {
        const cat = categorias.find((c) => c.id === t.categoria_id);
        const id = cat?.id || 'outros';
        const nome = cat?.nome || 'Outros';
        if (!mapa[id]) {
          mapa[id] = { id, nome, icone: cat?.icone || '$', cor: cat?.cor || '#6B7280', total: 0 };
        }
        mapa[id].total += t.valor;
      });
    return Object.values(mapa).sort((a, b) => b.total - a.total);
  }, [transacoesPorPeriodo, categorias]);

  const transacoesFiltradas = useMemo(() => {
    return transacoesPorPeriodo.filter((t) => {
      const tipoOk = filtroTipo === 'todos' || t.tipo === filtroTipo;
      const classificacaoOk = filtroClassificacao === 'todas' || getClassificacaoTransacao(t) === filtroClassificacao;
      const buscaOk = !busca || t.descricao.toLowerCase().includes(busca.toLowerCase());
      const catOk = !catSelecionada || (() => {
        const cat = categorias.find((c) => c.id === t.categoria_id);
        return (cat?.id || 'outros') === catSelecionada;
      })();
      return tipoOk && classificacaoOk && buscaOk && catOk;
    });
  }, [transacoesPorPeriodo, filtroTipo, filtroClassificacao, busca, catSelecionada, categorias]);

  const transacoesRealizadasFiltradas = useMemo(() => (
    transacoesFiltradas.filter((transacao) => transacaoJaOcorreuAteData(transacao, hoje))
  ), [transacoesFiltradas, hoje]);

  const totais = useMemo(() => ({
    receitas: transacoesRealizadasFiltradas
      .filter((t) => t.tipo === 'receita')
      .reduce((soma, t) => soma + t.valor, 0),
    despesas: transacoesRealizadasFiltradas
      .filter((t) => t.tipo === 'despesa')
      .reduce((soma, t) => soma + t.valor, 0),
  }), [transacoesRealizadasFiltradas]);

  const saldo = totais.receitas - totais.despesas;

  const transacoesAgrupadas = useMemo(() => {
    const grupos: Record<string, Transacao[]> = {};
    const ordenadas = [...transacoesFiltradas].sort((a, b) => b.data.localeCompare(a.data));
    ordenadas.forEach((t) => {
      if (!grupos[t.data]) grupos[t.data] = [];
      grupos[t.data].push(t);
    });
    return Object.entries(grupos).sort(([a], [b]) => b.localeCompare(a));
  }, [transacoesFiltradas]);

  const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  function handleEditar(transacao: Transacao) {
    setTransacaoEditar(transacao);
    setModalAberto(true);
  }

  function handleExcluir(id: string) {
    if (confirm('Excluir esta transacao?')) excluirTransacao(id);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Transacoes</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setTransacaoEditar(undefined);
              setModalAberto(true);
            }}
            className="btn-primary flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} /> Novo
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {(['mes', '3meses', 'tudo'] as PeriodoFiltro[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              periodo === p
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                : 'border border-white/10 bg-white/[0.05] text-slate-400 hover:text-white'
            }`}
          >
            {p === 'mes' ? 'Este mes' : p === '3meses' ? '3 meses' : 'Tudo'}
          </button>
        ))}
        {periodo === 'mes' && (
          <div className="ml-auto flex gap-2">
            <select
              value={filtroMes}
              onChange={(e) => setFiltroMes(Number(e.target.value))}
              className="rounded-xl border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
            >
              {nomesMeses.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={filtroAno}
              onChange={(e) => setFiltroAno(Number(e.target.value))}
              className="rounded-xl border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
            >
              {[2024, 2025, 2026, 2027].map((ano) => <option key={ano} value={ano}>{ano}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/30 p-3 text-center">
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-emerald-400">Receitas</div>
          <div className="text-base font-bold tabular-nums text-emerald-400">{formatarMoeda(totais.receitas)}</div>
        </div>
        <div className="rounded-2xl border border-red-800/40 bg-red-950/30 p-3 text-center">
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-red-400">Despesas</div>
          <div className="text-base font-bold tabular-nums text-red-400">{formatarMoeda(totais.despesas)}</div>
        </div>
        <div className={`rounded-2xl border p-3 text-center ${saldo >= 0 ? 'border-blue-800/40 bg-blue-950/30' : 'border-orange-800/40 bg-orange-950/30'}`}>
          <div className={`mb-0.5 text-[10px] uppercase tracking-wide ${saldo >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>Saldo</div>
          <div className={`text-base font-bold tabular-nums ${saldo >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
            {saldo >= 0 ? '+' : ''}{formatarMoeda(saldo)}
          </div>
        </div>
      </div>

      {chipsCategoria.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCatSelecionada(null)}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              catSelecionada === null
                ? 'bg-purple-600 text-white'
                : 'border border-white/10 bg-white/[0.05] text-slate-400 hover:text-white'
            }`}
          >
            Todos
          </button>
          {chipsCategoria.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCatSelecionada(catSelecionada === cat.id ? null : cat.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                catSelecionada === cat.id
                  ? 'text-white shadow-lg'
                  : 'border border-white/10 bg-white/[0.05] text-slate-400 hover:text-white'
              }`}
              style={catSelecionada === cat.id ? { background: cat.cor } : {}}
            >
              <span>{cat.icone}</span>
              <span>{cat.nome}</span>
              <span className="opacity-70">{formatarMoeda(cat.total)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por descricao..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-purple-500"
          />
        </div>
        <div className="flex gap-2">
          {FILTROS_TIPO.map((f) => (
            <button
              key={f.valor}
              onClick={() => setFiltroTipo(f.valor)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filtroTipo === f.valor
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTROS_CLASSIFICACAO.map((f) => (
            <button
              key={f.valor}
              onClick={() => setFiltroClassificacao(f.valor)}
              className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filtroClassificacao === f.valor
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Fixa significa recorrente. Se a data do mes ainda nao chegou, ela aparece como pendente e nao entra nos totais.
        </p>
      </div>

      <div className="space-y-4">
        {transacoesAgrupadas.length === 0 ? (
          <div className="py-12 text-center text-slate-600">
            <div className="mb-3 text-4xl">?</div>
            <p className="text-sm">Nenhuma transacao encontrada</p>
          </div>
        ) : (
          transacoesAgrupadas.map(([data, grupo]) => {
            const totalDia = grupo.reduce((soma, t) => (
              t.tipo === 'receita' ? soma + t.valor : soma - t.valor
            ), 0);

            return (
              <div key={data}>
                <div className="mb-2 flex items-center justify-between px-1 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {formatarDataHeader(data)}
                  </span>
                  <span className={`text-xs font-medium tabular-nums ${totalDia >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {totalDia >= 0 ? '+' : ''}{formatarMoeda(totalDia)}
                  </span>
                </div>
                <div className="space-y-2">
                  {grupo.map((t) => {
                    const cat = categorias.find((c) => c.id === t.categoria_id);
                    const conta = contas.find((item) => item.id === t.conta_id);
                    const cartao = cartoes.find((item) => item.id === t.cartao_id);
                    const badgeClassificacao = getBadgeClassificacao(t, hoje);
                    const eFutura = !transacaoJaOcorreuAteData(t, hoje);

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTransacaoDetalhe(t)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 text-left"
                      >
                        <div
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl"
                          style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)' }}
                        >
                          {cat?.icone || '$'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-white">{t.descricao}</div>
                          <div className="text-xs text-slate-500">
                            {cat?.nome || 'Outros'}
                            {t.metodo_pagamento && ` • ${t.metodo_pagamento.toUpperCase()}`}
                            {t.parcelas && t.parcelas > 1 && ` • ${t.parcelas}x`}
                            {conta ? ` • ${conta.nome}` : ''}
                            {cartao ? ` • ${cartao.nome}` : ''}
                          </div>
                          {badgeClassificacao && (
                            <div className="mt-1">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClassificacao.className}`}>
                                {badgeClassificacao.label}
                              </span>
                            </div>
                          )}
                          {eFutura && (
                            <div className="mt-1 text-[11px] text-amber-400">
                              Prevista para {parseFinancialDate(t.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </div>
                          )}
                          {t.itens_compra && t.itens_compra.length > 0 && (
                            <div className="mt-1">
                              <div className="text-[11px] font-medium text-emerald-400">
                                {t.itens_compra.length} item(ns) salvos da nota fiscal
                              </div>
                              <div className="truncate text-[11px] text-slate-500">
                                {t.itens_compra.slice(0, 3).map((item) => item.nome).join(' • ')}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <span className={`text-sm font-semibold tabular-nums ${t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.tipo === 'receita' ? '+' : '-'}{formatarMoeda(t.valor)}
                          </span>
                          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEditar(t);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-purple-900/30 hover:text-purple-400"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleExcluir(t.id);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-900/30 hover:text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ModalNovaTransacao
        aberto={modalAberto}
        onFechar={() => {
          setModalAberto(false);
          setTransacaoEditar(undefined);
        }}
        transacaoEditar={transacaoEditar}
      />

      {transacaoDetalhe && (
        <ModalDetalheTransacao
          transacao={transacaoDetalhe}
          conta={contas.find((item) => item.id === transacaoDetalhe.conta_id)}
          cartao={cartoes.find((item) => item.id === transacaoDetalhe.cartao_id)}
          categoriaNome={categorias.find((item) => item.id === transacaoDetalhe.categoria_id)?.nome || 'Outros'}
          onEditar={() => {
            setTransacaoDetalhe(null);
            handleEditar(transacaoDetalhe);
          }}
          onFechar={() => setTransacaoDetalhe(null)}
        />
      )}
    </div>
  );
}
