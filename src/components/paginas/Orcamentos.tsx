'use client';

import { useState, useMemo } from 'react';
import { Plus, Target, X, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';

export default function Orcamentos() {
  const hoje = new Date();
  const [mes, setMes]   = useState(hoje.getMonth() + 1);
  const [ano, setAno]   = useState(hoje.getFullYear());

  const {
    categorias, transacoes, orcamentos,
    adicionarOrcamento, editarOrcamento, excluirOrcamento,
  } = useFinanceiroStore();

  // Modal state
  const [modalCatId, setModalCatId]     = useState<string | null>(null);
  const [valorInput, setValorInput]     = useState('');
  const [salvando, setSalvando]         = useState(false);

  // Apenas categorias de despesa
  const catsDespesa = useMemo(
    () => categorias.filter(c => c.tipo === 'despesa'),
    [categorias],
  );

  // Orçamentos do mês selecionado
  const orcamentosMes = useMemo(
    () => orcamentos.filter(o => o.mes === mes && o.ano === ano),
    [orcamentos, mes, ano],
  );

  // Gastos do mês selecionado por categoria
  const gastosPorCat = useMemo(() => {
    const map = new Map<string, number>();
    transacoes
      .filter(t => {
        const d = new Date(t.data + 'T00:00:00');
        return t.tipo === 'despesa' && d.getMonth() + 1 === mes && d.getFullYear() === ano;
      })
      .forEach(t => map.set(t.categoria_id, (map.get(t.categoria_id) ?? 0) + t.valor));
    return map;
  }, [transacoes, mes, ano]);

  // Resumo geral
  const resumo = useMemo(() => {
    const totalOrcado  = orcamentosMes.reduce((s, o) => s + o.valor_limite, 0);
    const totalGasto   = orcamentosMes.reduce((s, o) => s + (gastosPorCat.get(o.categoria_id) ?? 0), 0);
    const pct          = totalOrcado > 0 ? (totalGasto / totalOrcado) * 100 : 0;
    return { totalOrcado, totalGasto, pct };
  }, [orcamentosMes, gastosPorCat]);

  // Categorias ordenadas: com orçamento primeiro, depois sem
  const catsOrdenadas = useMemo(() => {
    const comOrc  = catsDespesa.filter(c => orcamentosMes.some(o => o.categoria_id === c.id));
    const semOrc  = catsDespesa.filter(c => !orcamentosMes.some(o => o.categoria_id === c.id));
    return [...comOrc, ...semOrc];
  }, [catsDespesa, orcamentosMes]);

  function abrirModal(catId: string) {
    const orc = orcamentosMes.find(o => o.categoria_id === catId);
    setValorInput(orc ? String(orc.valor_limite) : '');
    setModalCatId(catId);
  }

  function fecharModal() {
    setModalCatId(null);
    setValorInput('');
  }

  function salvarOrcamento() {
    if (!modalCatId) return;
    const valor = parseFloat(valorInput.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) return;

    setSalvando(true);
    const existente = orcamentosMes.find(o => o.categoria_id === modalCatId);
    if (existente) {
      editarOrcamento(existente.id, { valor_limite: valor });
    } else {
      adicionarOrcamento({ categoria_id: modalCatId, valor_limite: valor, mes, ano });
    }
    setSalvando(false);
    fecharModal();
  }

  function removerOrcamento(catId: string) {
    const orc = orcamentosMes.find(o => o.categoria_id === catId);
    if (orc) excluirOrcamento(orc.id);
  }

  // Gera opções de mês/ano para o seletor
  const mesesNome = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const anoOpts = [hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1];

  function corBarra(pct: number) {
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  }

  function iconeStatus(pct: number) {
    if (pct >= 90) return <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />;
    if (pct >= 70) return <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />;
    return <CheckCircle size={13} className="text-emerald-400 flex-shrink-0" />;
  }

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
          <Target size={18} className="text-purple-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Orçamentos</h1>
          <p className="text-xs text-slate-500">Defina limites mensais por categoria</p>
        </div>
      </div>

      {/* Seletor de mês/ano */}
      <div className="flex gap-2">
        <select
          value={mes}
          onChange={e => setMes(Number(e.target.value))}
          className="flex-1 bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
        >
          {mesesNome.map((nome, i) => (
            <option key={i + 1} value={i + 1}>{nome}</option>
          ))}
        </select>
        <select
          value={ano}
          onChange={e => setAno(Number(e.target.value))}
          className="w-28 bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
        >
          {anoOpts.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Card resumo */}
      {resumo.totalOrcado > 0 && (
        <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-purple-400" />
            <span className="text-sm font-semibold text-slate-300">Resumo do Mês</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[11px] text-slate-500 mb-0.5">Orçado</p>
              <p className="text-sm font-bold text-white tabular-nums">{formatarMoeda(resumo.totalOrcado)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-0.5">Gasto</p>
              <p className={`text-sm font-bold tabular-nums ${resumo.pct >= 90 ? 'text-red-400' : resumo.pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {formatarMoeda(resumo.totalGasto)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-0.5">Utilizado</p>
              <p className={`text-sm font-bold tabular-nums ${resumo.pct >= 90 ? 'text-red-400' : resumo.pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {resumo.pct.toFixed(0)}%
              </p>
            </div>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${corBarra(resumo.pct)}`}
              style={{ width: `${Math.min(resumo.pct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Lista de categorias */}
      <div className="space-y-2">
        {catsOrdenadas.length === 0 && (
          <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-10 flex flex-col items-center gap-2 text-slate-600">
            <Target size={32} className="opacity-30" />
            <p className="text-sm">Nenhuma categoria de despesa cadastrada</p>
          </div>
        )}

        {catsOrdenadas.map(cat => {
          const orc    = orcamentosMes.find(o => o.categoria_id === cat.id);
          const gasto  = gastosPorCat.get(cat.id) ?? 0;
          const limite = orc?.valor_limite ?? 0;
          const pct    = limite > 0 ? (gasto / limite) * 100 : 0;

          return (
            <div key={cat.id} className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-2">
                {/* Ícone + nome */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: `${cat.cor}22`, color: cat.cor }}
                >
                  {cat.icone}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{cat.nome}</p>
                  {orc ? (
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {formatarMoeda(gasto)} / {formatarMoeda(limite)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-600">Sem limite definido</p>
                  )}
                </div>

                {/* Status + ações */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {orc && iconeStatus(pct)}
                  {orc && (
                    <button
                      onClick={() => removerOrcamento(cat.id)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remover orçamento"
                    >
                      <X size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => abrirModal(cat.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors"
                    title={orc ? 'Editar limite' : 'Definir limite'}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Barra de progresso */}
              {orc ? (
                <div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${corBarra(pct)}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className={`text-[10px] font-medium ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {pct.toFixed(0)}% utilizado
                    </span>
                    {pct > 100 && (
                      <span className="text-[10px] text-red-400 font-semibold">
                        +{formatarMoeda(gasto - limite)} acima
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-1.5 bg-white/5 rounded-full" />
              )}
            </div>
          );
        })}
      </div>

      {/* Modal inline para definir limite */}
      {modalCatId && (() => {
        const cat = categorias.find(c => c.id === modalCatId);
        const orc = orcamentosMes.find(o => o.categoria_id === modalCatId);
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={fecharModal}
          >
            <div
              className="w-full max-w-sm bg-[#0A0E1A] border border-white/[0.08] rounded-2xl p-5 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              {/* Header modal */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                    style={{ background: `${cat?.cor}22`, color: cat?.cor }}
                  >
                    {cat?.icone}
                  </div>
                  <p className="text-sm font-semibold text-white">{cat?.nome}</p>
                </div>
                <button onClick={fecharModal} className="text-slate-500 hover:text-slate-300 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  {orc ? 'Novo limite mensal (R$)' : 'Limite mensal (R$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 500"
                  value={valorInput}
                  onChange={e => setValorInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && salvarOrcamento()}
                  autoFocus
                  className="w-full bg-[#0F1629] border border-white/10 rounded-xl px-4 py-2.5 text-base font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={fecharModal}
                  className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-slate-400 text-sm font-medium hover:bg-white/[0.08] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarOrcamento}
                  disabled={salvando || !valorInput}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {orc ? 'Atualizar' : 'Definir'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
