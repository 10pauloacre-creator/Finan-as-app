'use client';

import { useState, useMemo } from 'react';
import { Plus, Target, X, AlertTriangle, CheckCircle, TrendingUp, Palette, Smile } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda, gerarId } from '@/lib/storage';

// Paleta de cores para novas categorias
const CORES_PRESET = [
  '#7C3AED','#3B82F6','#10B981','#F59E0B','#EF4444',
  '#EC4899','#8B5CF6','#06B6D4','#84CC16','#F97316',
  '#14B8A6','#6366F1','#A855F7','#22C55E','#EAB308',
];

// Ícones comuns
const ICONES_PRESET = [
  '🛒','🍔','🚗','💊','📚','🎮','👗','🏠','📱','✈️',
  '🎬','🐾','💄','🎁','🏋️','☕','🍕','🎸','🌿','💡',
  '🧾','💰','🎯','🔧','🏖️','📦','🐶','🧴','💻','🏦',
];

export default function Orcamentos() {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());

  const {
    categorias, transacoes, orcamentos,
    adicionarOrcamento, editarOrcamento, excluirOrcamento,
    adicionarCategoria,
  } = useFinanceiroStore();

  // Modal de limite
  const [modalCatId, setModalCatId]   = useState<string | null>(null);
  const [valorInput, setValorInput]   = useState('');
  const [salvando, setSalvando]       = useState(false);

  // Modal nova categoria
  const [modalNovaCat, setModalNovaCat] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState({
    nome: '',
    icone: '🎯',
    cor: '#7C3AED',
  });

  const catsDespesa = useMemo(
    () => categorias.filter(c => c.tipo === 'despesa'),
    [categorias],
  );

  const orcamentosMes = useMemo(
    () => orcamentos.filter(o => o.mes === mes && o.ano === ano),
    [orcamentos, mes, ano],
  );

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

  const resumo = useMemo(() => {
    const totalOrcado = orcamentosMes.reduce((s, o) => s + o.valor_limite, 0);
    const totalGasto  = orcamentosMes.reduce((s, o) => s + (gastosPorCat.get(o.categoria_id) ?? 0), 0);
    const pct         = totalOrcado > 0 ? (totalGasto / totalOrcado) * 100 : 0;
    return { totalOrcado, totalGasto, pct };
  }, [orcamentosMes, gastosPorCat]);

  const catsOrdenadas = useMemo(() => {
    const comOrc = catsDespesa.filter(c => orcamentosMes.some(o => o.categoria_id === c.id));
    const semOrc = catsDespesa.filter(c => !orcamentosMes.some(o => o.categoria_id === c.id));
    return [...comOrc, ...semOrc];
  }, [catsDespesa, orcamentosMes]);

  function abrirModal(catId: string) {
    const orc = orcamentosMes.find(o => o.categoria_id === catId);
    setValorInput(orc ? String(orc.valor_limite) : '');
    setModalCatId(catId);
  }

  function fecharModal() { setModalCatId(null); setValorInput(''); }

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

  function criarNovaCategoria() {
    if (!novaCategoria.nome.trim()) return;
    adicionarCategoria({
      nome: novaCategoria.nome.trim(),
      icone: novaCategoria.icone,
      cor: novaCategoria.cor,
      tipo: 'despesa',
    });
    setNovaCategoria({ nome: '', icone: '🎯', cor: '#7C3AED' });
    setModalNovaCat(false);
  }

  const mesesNome = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const anoOpts   = [hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1];

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
            <Target size={18} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Orçamentos</h1>
            <p className="text-xs text-slate-500">Defina limites mensais por categoria</p>
          </div>
        </div>
        {/* Botão nova categoria */}
        <button
          onClick={() => setModalNovaCat(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-400 hover:text-purple-300 hover:border-purple-500/30 transition-all"
        >
          <Plus size={13} />
          Nova Categoria
        </button>
      </div>

      {/* Seletor mês/ano */}
      <div className="flex gap-2">
        <select value={mes} onChange={e => setMes(Number(e.target.value))}
          className="flex-1 bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50">
          {mesesNome.map((nome, i) => <option key={i + 1} value={i + 1}>{nome}</option>)}
        </select>
        <select value={ano} onChange={e => setAno(Number(e.target.value))}
          className="w-28 bg-[#0F1629] border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50">
          {anoOpts.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Resumo */}
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
            <div className={`h-full rounded-full transition-all duration-700 ${corBarra(resumo.pct)}`}
              style={{ width: `${Math.min(resumo.pct, 100)}%` }} />
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {catsOrdenadas.length === 0 && (
          <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-10 flex flex-col items-center gap-3 text-slate-600">
            <Target size={32} className="opacity-30" />
            <p className="text-sm text-center">Nenhuma categoria de despesa cadastrada</p>
            <button onClick={() => setModalNovaCat(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 text-xs font-medium hover:bg-purple-600/30 transition-colors">
              <Plus size={13} /> Criar primeira categoria
            </button>
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
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: `${cat.cor}22`, color: cat.cor }}>
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  {orc && iconeStatus(pct)}
                  {orc && (
                    <button onClick={() => removerOrcamento(cat.id)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remover orçamento">
                      <X size={13} />
                    </button>
                  )}
                  <button onClick={() => abrirModal(cat.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors"
                    title={orc ? 'Editar limite' : 'Definir limite'}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              {orc ? (
                <div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${corBarra(pct)}`}
                      style={{ width: `${Math.min(pct, 100)}%` }} />
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

      {/* ── Modal: Definir Limite ─────────────────────────── */}
      {modalCatId && (() => {
        const cat = categorias.find(c => c.id === modalCatId);
        const orc = orcamentosMes.find(o => o.categoria_id === modalCatId);
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }} onClick={fecharModal}>
            <div className="w-full max-w-sm bg-[#0A0E1A] border border-white/[0.08] rounded-2xl p-5 space-y-4"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                    style={{ background: `${cat?.cor}22`, color: cat?.cor }}>
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
                <input type="number" min="0" step="0.01" placeholder="Ex: 500"
                  value={valorInput} onChange={e => setValorInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && salvarOrcamento()}
                  autoFocus
                  className="w-full bg-[#0F1629] border border-white/10 rounded-xl px-4 py-2.5 text-base font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50" />
              </div>
              <div className="flex gap-2">
                <button onClick={fecharModal}
                  className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-slate-400 text-sm font-medium hover:bg-white/[0.08] transition-colors">
                  Cancelar
                </button>
                <button onClick={salvarOrcamento} disabled={salvando || !valorInput}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                  {orc ? 'Atualizar' : 'Definir'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal: Nova Categoria de Orçamento ───────────── */}
      {modalNovaCat && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setModalNovaCat(false)}>
          <div className="w-full max-w-sm bg-[#0A0E1A] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
                  style={{ background: `${novaCategoria.cor}22` }}>
                  {novaCategoria.icone}
                </div>
                <h3 className="text-sm font-bold text-white">Nova Categoria de Orçamento</h3>
              </div>
              <button onClick={() => setModalNovaCat(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">

              {/* Nome */}
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block font-medium">Nome da Categoria *</label>
                <input type="text" autoFocus placeholder="Ex: Viagens, Academia, Pets..."
                  value={novaCategoria.nome}
                  onChange={e => setNovaCategoria(n => ({ ...n, nome: e.target.value }))}
                  className="w-full bg-[#0F1629] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50" />
              </div>

              {/* Preview */}
              {novaCategoria.nome && (
                <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-4 py-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: `${novaCategoria.cor}22`, color: novaCategoria.cor }}>
                    {novaCategoria.icone}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{novaCategoria.nome}</p>
                    <p className="text-xs text-slate-500">Categoria de despesa</p>
                  </div>
                </div>
              )}

              {/* Ícone */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block font-medium flex items-center gap-1">
                  <Smile size={12} /> Ícone
                </label>
                <div className="grid grid-cols-10 gap-1.5">
                  {ICONES_PRESET.map(ic => (
                    <button key={ic} type="button"
                      onClick={() => setNovaCategoria(n => ({ ...n, icone: ic }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${
                        novaCategoria.icone === ic
                          ? 'ring-2 ring-purple-500 bg-purple-600/20 scale-110'
                          : 'bg-white/[0.04] hover:bg-white/[0.08]'
                      }`}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cor */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block font-medium flex items-center gap-1">
                  <Palette size={12} /> Cor
                </label>
                <div className="flex flex-wrap gap-2">
                  {CORES_PRESET.map(cor => (
                    <button key={cor} type="button"
                      onClick={() => setNovaCategoria(n => ({ ...n, cor }))}
                      className={`w-7 h-7 rounded-full transition-all ${
                        novaCategoria.cor === cor ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0A0E1A] scale-110' : 'hover:scale-105'
                      }`}
                      style={{ background: cor }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setModalNovaCat(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-slate-400 text-sm font-medium hover:bg-white/[0.08] transition-colors">
                Cancelar
              </button>
              <button onClick={criarNovaCategoria} disabled={!novaCategoria.nome.trim()}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
                Criar Categoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
