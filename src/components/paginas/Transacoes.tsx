'use client';

import { useState, useMemo } from 'react';
import { Search, Trash2, Edit, Plus } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { Transacao } from '@/types';
import ModalNovaTransacao from '@/components/modais/ModalNovaTransacao';
import { isSameFinancialMonth, parseFinancialDate, startOfTodayLocal } from '@/lib/date';

const FILTROS_TIPO = [
  { valor: 'todos',   label: 'Todos'     },
  { valor: 'despesa', label: 'Despesas'  },
  { valor: 'receita', label: 'Receitas'  },
];

const DIAS_SEMANA_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
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

function getBadgeClassificacao(transacao: Transacao) {
  const classificacao = getClassificacaoTransacao(transacao);
  if (classificacao === 'fixa') {
    return {
      label: transacao.tipo === 'receita' ? 'Receita fixa' : 'Gasto fixo',
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
  const d = new Date(dataStr + 'T00:00:00');
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return `${DIAS_SEMANA_PT[d.getDay()]}, ${d.getDate()} ${MESES_PT[d.getMonth()]}`;
}

export default function Transacoes() {
  const { transacoes, categorias, excluirTransacao } = useFinanceiroStore();

  const [busca, setBusca]                 = useState('');
  const [filtroTipo, setFiltroTipo]       = useState('todos');
  const [filtroMes, setFiltroMes]         = useState(new Date().getMonth() + 1);
  const [filtroAno, setFiltroAno]         = useState(new Date().getFullYear());
  const [periodo, setPeriodo]             = useState<PeriodoFiltro>('mes');
  const [filtroClassificacao, setFiltroClassificacao] = useState<ClassificacaoFiltro>('todas');
  const [catSelecionada, setCatSelecionada] = useState<string | null>(null);
  const [modalAberto, setModalAberto]     = useState(false);
  const [transacaoEditar, setTransacaoEditar] = useState<Transacao | undefined>();
  const hoje = startOfTodayLocal();

  // Filtragem por período
  const transacoesPorPeriodo = useMemo(() => {
    const agora = new Date();
    return transacoes.filter(t => {
      if (periodo === 'mes') {
        return isSameFinancialMonth(t.data, filtroMes, filtroAno);
      }
      if (periodo === '3meses') {
        const tresMesesAtras = new Date(agora);
        tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 2);
        tresMesesAtras.setDate(1);
        return parseFinancialDate(t.data) >= tresMesesAtras;
      }
      return true; // tudo
    });
  }, [transacoes, periodo, filtroMes, filtroAno]);

  // Chips de categoria com totais
  const chipsCategoria = useMemo(() => {
    const mapa: Record<string, { id: string; nome: string; icone: string; cor: string; total: number }> = {};
    transacoesPorPeriodo
      .filter(t => t.tipo === 'despesa')
      .forEach(t => {
        const cat = categorias.find(c => c.id === t.categoria_id);
        const id = cat?.id || 'outros';
        const nome = cat?.nome || 'Outros';
        if (!mapa[id]) mapa[id] = { id, nome, icone: cat?.icone || '💳', cor: cat?.cor || '#6B7280', total: 0 };
        mapa[id].total += t.valor;
      });
    return Object.values(mapa).sort((a, b) => b.total - a.total);
  }, [transacoesPorPeriodo, categorias]);

  // Filtragem final
  const transacoesFiltradas = useMemo(() => {
    return transacoesPorPeriodo.filter(t => {
      const tipoOk = filtroTipo === 'todos' || t.tipo === filtroTipo;
      const classificacaoOk = filtroClassificacao === 'todas' || getClassificacaoTransacao(t) === filtroClassificacao;
      const buscaOk = !busca || t.descricao.toLowerCase().includes(busca.toLowerCase());
      const catOk = !catSelecionada || (() => {
        const cat = categorias.find(c => c.id === t.categoria_id);
        return (cat?.id || 'outros') === catSelecionada;
      })();
      return tipoOk && classificacaoOk && buscaOk && catOk;
    });
  }, [transacoesPorPeriodo, filtroTipo, filtroClassificacao, busca, catSelecionada, categorias]);

  const totais = useMemo(() => ({
    receitas: transacoesFiltradas.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0),
    despesas: transacoesFiltradas.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0),
  }), [transacoesFiltradas]);

  const saldo = totais.receitas - totais.despesas;

  // Agrupar por dia
  const transacoesAgrupadas = useMemo(() => {
    const grupos: Record<string, Transacao[]> = {};
    const ordenadas = [...transacoesFiltradas].sort((a, b) => b.data.localeCompare(a.data));
    ordenadas.forEach(t => {
      if (!grupos[t.data]) grupos[t.data] = [];
      grupos[t.data].push(t);
    });
    return Object.entries(grupos).sort(([a], [b]) => b.localeCompare(a));
  }, [transacoesFiltradas]);

  const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  function handleEditar(t: Transacao) {
    setTransacaoEditar(t);
    setModalAberto(true);
  }

  function handleExcluir(id: string) {
    if (confirm('Excluir esta transação?')) excluirTransacao(id);
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Transações</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setTransacaoEditar(undefined); setModalAberto(true); }}
            className="btn-primary flex items-center gap-1.5 text-white px-3 py-2 rounded-xl text-sm font-medium"
          >
            <Plus size={16} /> Novo
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {(['mes', '3meses', 'tudo'] as PeriodoFiltro[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              periodo === p
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                : 'bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {p === 'mes' ? 'Este mês' : p === '3meses' ? '3 meses' : 'Tudo'}
          </button>
        ))}
        {periodo === 'mes' && (
          <div className="flex gap-2 ml-auto">
            <select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-2 py-1.5">
              {nomesMeses.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-2 py-1.5">
              {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-3 text-center">
          <div className="text-emerald-400 text-[10px] mb-0.5 uppercase tracking-wide">Receitas</div>
          <div className="text-emerald-400 text-base font-bold tabular-nums">{formatarMoeda(totais.receitas)}</div>
        </div>
        <div className="bg-red-950/30 border border-red-800/40 rounded-2xl p-3 text-center">
          <div className="text-red-400 text-[10px] mb-0.5 uppercase tracking-wide">Despesas</div>
          <div className="text-red-400 text-base font-bold tabular-nums">{formatarMoeda(totais.despesas)}</div>
        </div>
        <div className={`rounded-2xl p-3 text-center border ${saldo >= 0 ? 'bg-blue-950/30 border-blue-800/40' : 'bg-orange-950/30 border-orange-800/40'}`}>
          <div className={`text-[10px] mb-0.5 uppercase tracking-wide ${saldo >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>Saldo</div>
          <div className={`text-base font-bold tabular-nums ${saldo >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
            {saldo >= 0 ? '+' : ''}{formatarMoeda(saldo)}
          </div>
        </div>
      </div>

      {/* Category chips */}
      {chipsCategoria.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCatSelecionada(null)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              catSelecionada === null
                ? 'bg-purple-600 text-white'
                : 'bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            Todos
          </button>
          {chipsCategoria.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCatSelecionada(catSelecionada === cat.id ? null : cat.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                catSelecionada === cat.id
                  ? 'text-white shadow-lg'
                  : 'bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white'
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

      {/* Busca e filtro tipo */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por descrição..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-purple-500"
          />
        </div>
        <div className="flex gap-2">
          {FILTROS_TIPO.map(f => (
            <button
              key={f.valor}
              onClick={() => setFiltroTipo(f.valor)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
          {FILTROS_CLASSIFICACAO.map(f => (
            <button
              key={f.valor}
              onClick={() => setFiltroClassificacao(f.valor)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtroClassificacao === f.valor
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista agrupada por dia */}
      <div className="space-y-4">
        {transacoesAgrupadas.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm">Nenhuma transação encontrada</p>
          </div>
        ) : (
          transacoesAgrupadas.map(([data, grupo]) => {
            const totalDia = grupo.reduce((s, t) =>
              t.tipo === 'receita' ? s + t.valor : s - t.valor, 0);
            return (
              <div key={data}>
                {/* Header do dia */}
                <div className="flex items-center justify-between py-2 px-1 mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {formatarDataHeader(data)}
                  </span>
                  <span className={`text-xs font-medium tabular-nums ${totalDia >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {totalDia >= 0 ? '+' : ''}{formatarMoeda(totalDia)}
                  </span>
                </div>
                {/* Transações do dia */}
                <div className="space-y-2">
                  {grupo.map(t => {
                    const cat = categorias.find(c => c.id === t.categoria_id);
                    const badgeClassificacao = getBadgeClassificacao(t);
                    const eFutura = getClassificacaoTransacao(t) === 'futura' || parseFinancialDate(t.data) > hoje;
                    return (
                      <div key={t.id} className="flex items-center gap-3 bg-slate-800/40 rounded-xl p-3 border border-slate-700/50 group">
                        <div
                          className="text-xl w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0"
                          style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)' }}
                        >
                          {cat?.icone || '💳'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{t.descricao}</div>
                          <div className="text-xs text-slate-500">
                            {cat?.nome || 'Outros'}
                            {t.metodo_pagamento && ` • ${t.metodo_pagamento.toUpperCase()}`}
                            {t.parcelas && t.parcelas > 1 && ` • ${(t as Transacao & { parcela_atual?: number }).parcela_atual || 1}/${t.parcelas}x`}
                          </div>
                          {t.local && <div className="text-xs text-slate-600 truncate">📍 {t.local}</div>}
                          {badgeClassificacao && (
                            <div className="mt-1">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClassificacao.className}`}>
                                {badgeClassificacao.label}
                              </span>
                            </div>
                          )}
                          {eFutura && (
                            <div className="text-[11px] text-amber-400 mt-1">
                              Prevista para {parseFinancialDate(t.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </div>
                          )}
                          {t.itens_compra && t.itens_compra.length > 0 && (
                            <div className="mt-1">
                              <div className="text-[11px] text-emerald-400 font-medium">
                                {t.itens_compra.length} item(ns) salvos da nota fiscal
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {t.itens_compra.slice(0, 3).map((item) => item.nome).join(' • ')}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-sm font-semibold tabular-nums ${t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.tipo === 'receita' ? '+' : '-'}{formatarMoeda(t.valor)}
                          </span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditar(t)}
                              className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-purple-900/30 rounded-lg"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleExcluir(t.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded-lg"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
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
        onFechar={() => { setModalAberto(false); setTransacaoEditar(undefined); }}
        transacaoEditar={transacaoEditar}
      />
    </div>
  );
}

