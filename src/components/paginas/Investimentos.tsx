'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, TrendingUp, Calculator, RefreshCw, Info } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { TipoInvestimento } from '@/types';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';

// ── Tipos de investimento ──────────────────────────────
const TIPOS_INV: { valor: TipoInvestimento; label: string; icone: string; descricao: string }[] = [
  { valor: 'tesouro_selic',     label: 'Tesouro Selic',      icone: '🏛️', descricao: '100% Selic — liquidez diária' },
  { valor: 'tesouro_ipca',      label: 'Tesouro IPCA+',      icone: '📊', descricao: 'IPCA + taxa fixa' },
  { valor: 'tesouro_prefixado', label: 'Tesouro Prefixado',  icone: '📋', descricao: 'Taxa fixa pré-acordada' },
  { valor: 'cdb',               label: 'CDB',                icone: '🏦', descricao: '% do CDI (até 120% CDI)' },
  { valor: 'lci_lca',           label: 'LCI/LCA',            icone: '🌱', descricao: 'Isento IR — % do CDI' },
  { valor: 'fundos_di',         label: 'Fundo DI',           icone: '💼', descricao: '100% CDI (menos taxa adm.)' },
  { valor: 'poupanca',          label: 'Poupança',           icone: '🐷', descricao: '70% Selic (isenta IR)' },
  { valor: 'acoes',             label: 'Ações / FII',        icone: '📈', descricao: 'Renda variável' },
  { valor: 'cripto',            label: 'Cripto',             icone: '₿',  descricao: 'Renda variável — alta volatilidade' },
  { valor: 'outro',             label: 'Outro',              icone: '💰', descricao: 'Personalizado' },
];

// ── Tabela IR para renda fixa ──────────────────────────
function calcularIR(rendimento: number, meses: number): number {
  if (meses <= 6)  return rendimento * 0.225;
  if (meses <= 12) return rendimento * 0.20;
  if (meses <= 24) return rendimento * 0.175;
  return rendimento * 0.15;
}

function calcularRendimentoAnual(principal: number, aporteMensal: number, taxaAno: number, anos: number): number[] {
  const resultados: number[] = [];
  let total = principal;
  const taxaMes = Math.pow(1 + taxaAno / 100, 1 / 12) - 1;
  for (let m = 0; m < anos * 12; m++) {
    total = total * (1 + taxaMes) + aporteMensal;
    if ((m + 1) % 12 === 0) resultados.push(total);
  }
  return resultados;
}

// ── Cenários do simulador ──────────────────────────────
function gerarCenarios(
  principal: number,
  aporteMensal: number,
  meses: number,
  taxas: { selic: number; cdi: number; ipca: number }
) {
  const { selic, cdi, ipca } = taxas;
  const anos = meses / 12;

  const cenarios = [
    { nome: 'Poupança',        taxa: selic * 0.7,           cor: '#94A3B8', isentoIR: true  },
    { nome: 'Tesouro Selic',   taxa: selic,                  cor: '#3B82F6', isentoIR: false },
    { nome: 'CDB 100% CDI',    taxa: cdi,                    cor: '#7C3AED', isentoIR: false },
    { nome: 'CDB 110% CDI',    taxa: cdi * 1.1,              cor: '#8B5CF6', isentoIR: false },
    { nome: 'LCI 90% CDI',     taxa: cdi * 0.9,              cor: '#10B981', isentoIR: true  },
    { nome: 'LCI 95% CDI',     taxa: cdi * 0.95,             cor: '#059669', isentoIR: true  },
    { nome: 'Tesouro IPCA+6%', taxa: ipca + 6,               cor: '#F59E0B', isentoIR: false },
    { nome: 'CDB 120% CDI',    taxa: cdi * 1.2,              cor: '#A78BFA', isentoIR: false },
  ];

  return cenarios.map(c => {
    const taxaMes  = Math.pow(1 + c.taxa / 100, 1 / 12) - 1;
    let total      = principal;
    let totalAport = 0;
    for (let m = 0; m < meses; m++) {
      total       = total * (1 + taxaMes) + aporteMensal;
      totalAport += aporteMensal;
    }
    const totalInvest   = principal + totalAport;
    const rendimentoBruto = total - totalInvest;
    const ir              = c.isentoIR ? 0 : calcularIR(rendimentoBruto, meses);
    const rendLiquido     = rendimentoBruto - ir;
    const totalLiquido    = totalInvest + rendLiquido;

    return {
      ...c,
      totalInvest,
      rendimentoBruto,
      ir,
      rendLiquido,
      totalLiquido,
    };
  }).sort((a, b) => b.totalLiquido - a.totalLiquido);
}

// ══════════════════════════════════════════════════════
export default function Investimentos() {
  const { investimentos, adicionarInvestimento, excluirInvestimento, selicAtual, cdiAtual, ipcaAtual, setTaxas } = useFinanceiroStore();

  const [aba, setAba]                 = useState<'carteira' | 'simulador'>('simulador');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [buscando, setBuscando]       = useState(false);

  // Simulador
  const [simPrincipal, setSimPrincipal] = useState('1000');
  const [simAporte, setSimAporte]       = useState('200');
  const [simMeses, setSimMeses]         = useState(12);
  const [simAnos, setSimAnos]           = useState(false); // toggle meses/anos

  // Formulário investimento
  const [form, setForm] = useState({
    nome: '',
    tipo: 'cdb' as TipoInvestimento,
    valor_investido: '',
    data_inicio: new Date().toISOString().split('T')[0],
    banco: '',
    taxa_rendimento: '',
    indice: 'cdi' as 'prefixado' | 'cdi' | 'selic' | 'ipca' | 'poupanca',
    isento_ir: false,
  });

  // Buscar taxas
  async function buscarTaxas() {
    setBuscando(true);
    try {
      const res  = await fetch('/api/selic');
      const data = await res.json();
      const selic = data.taxa || 10.75;
      const cdi   = selic - 0.1;
      const ipca  = 4.83; // fallback — idealmente buscar do BCB
      setTaxas(selic, cdi, ipca);
    } catch { /* usa fallback */ }
    finally { setBuscando(false); }
  }

  useEffect(() => {
    if (!selicAtual) buscarTaxas();
  }, []);

  const taxas = {
    selic: selicAtual || 10.75,
    cdi:   cdiAtual   || 10.65,
    ipca:  ipcaAtual  || 4.83,
  };

  // Calcular cenários
  const cenarios = useMemo(() => {
    const principal = parseFloat(simPrincipal) || 0;
    const aporte    = parseFloat(simAporte)    || 0;
    const meses     = simAnos ? simMeses * 12 : simMeses;
    if (principal <= 0) return [];
    return gerarCenarios(principal, aporte, meses, taxas);
  }, [simPrincipal, simAporte, simMeses, simAnos, taxas]);

  // Projeção progressiva (para o gráfico de área)
  const projecaoGrafico = useMemo(() => {
    const principal = parseFloat(simPrincipal) || 0;
    const aporte    = parseFloat(simAporte)    || 0;
    const meses     = simAnos ? simMeses * 12 : simMeses;
    if (principal <= 0 || meses < 1) return [];

    const top3 = cenarios.slice(0, 3);
    return Array.from({ length: Math.min(meses, 60) }, (_, i) => {
      const m = i + 1;
      const entry: Record<string, number | string> = { periodo: m <= 12 ? `${m}m` : `${Math.floor(m/12)}a${m%12 ? m%12+'m' : ''}` };
      top3.forEach(c => {
        const taxaMes = Math.pow(1 + c.taxa / 100, 1 / 12) - 1;
        let total = principal;
        for (let k = 0; k < m; k++) total = total * (1 + taxaMes) + aporte;
        entry[c.nome] = Math.round(total);
      });
      return entry;
    }).filter((_, i) => {
      const mTotal = simAnos ? simMeses * 12 : simMeses;
      if (mTotal <= 12)  return true;
      if (mTotal <= 24)  return i % 1 === 0;
      return i % 3 === 0 || i === Math.min(mTotal, 60) - 1;
    });
  }, [cenarios, simPrincipal, simAporte, simMeses, simAnos]);

  // Totais da carteira
  const totalCarteira = investimentos.reduce((s, i) => s + i.valor_investido, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    adicionarInvestimento({
      nome: form.nome,
      tipo: form.tipo,
      valor_investido: parseFloat(form.valor_investido) || 0,
      data_inicio: form.data_inicio,
      banco: form.banco || undefined,
      taxa_rendimento: parseFloat(form.taxa_rendimento) || undefined,
      indice: form.indice,
      isento_ir: form.isento_ir,
    });
    setForm({ nome:'', tipo:'cdb', valor_investido:'', data_inicio: new Date().toISOString().split('T')[0], banco:'', taxa_rendimento:'', indice:'cdi', isento_ir: false });
    setMostrarForm(false);
  }

  const MESES_OPCOES = [1,3,6,12,18,24,36,48,60];
  const ANOS_OPCOES  = [1,2,3,5,10,15,20,30];

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Investimentos</h2>
          <p className="text-slate-500 text-sm">
            Selic: <span className="text-purple-400 font-semibold">{taxas.selic.toFixed(2)}%</span>
            {' '}• CDI: <span className="text-purple-400 font-semibold">{taxas.cdi.toFixed(2)}%</span>
            {' '}• IPCA: <span className="text-purple-400 font-semibold">{taxas.ipca.toFixed(2)}%</span>
            <button onClick={buscarTaxas} disabled={buscando} className="ml-2 text-slate-600 hover:text-purple-400 transition-colors" aria-label="Atualizar taxas">
              <RefreshCw size={12} className={buscando ? 'animate-spin inline' : 'inline'} />
            </button>
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex bg-white/[0.04] rounded-xl p-1">
        {([
          { id: 'simulador', label: '🧮 Simulador' },
          { id: 'carteira',  label: '📊 Minha Carteira' },
        ] as const).map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              aba === a.id ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ── ABA: SIMULADOR ────────────────────────────── */}
      {aba === 'simulador' && (
        <div className="space-y-5">
          {/* Inputs */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Calculator size={15} className="text-purple-400" />
              Configurar Simulação
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Valor Inicial (R$)</label>
                <input type="number" min="0" step="100"
                  value={simPrincipal} onChange={e => setSimPrincipal(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white text-base font-semibold rounded-xl px-3 py-3 outline-none focus:border-purple-500 tabular-nums" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Aporte Mensal (R$)</label>
                <input type="number" min="0" step="50"
                  value={simAporte} onChange={e => setSimAporte(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white text-base font-semibold rounded-xl px-3 py-3 outline-none focus:border-purple-500 tabular-nums" />
              </div>
            </div>
            {/* Prazo */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">Prazo</label>
                <div className="flex bg-white/5 rounded-lg p-0.5">
                  <button onClick={() => setSimAnos(false)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${!simAnos ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>
                    Meses
                  </button>
                  <button onClick={() => setSimAnos(true)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${simAnos ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>
                    Anos
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(simAnos ? ANOS_OPCOES : MESES_OPCOES).map(v => (
                  <button key={v} onClick={() => setSimMeses(v)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                      simMeses === v ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                    }`}>
                    {v}{simAnos ? 'a' : 'm'}
                  </button>
                ))}
              </div>
            </div>

            {/* Resumo */}
            {parseFloat(simPrincipal) > 0 && (
              <div className="bg-purple-950/30 border border-purple-800/30 rounded-xl p-3 text-xs text-slate-400">
                Total investido: <span className="text-white font-semibold tabular-nums">
                  {formatarMoeda(parseFloat(simPrincipal) + parseFloat(simAporte || '0') * (simAnos ? simMeses * 12 : simMeses))}
                </span>
                {' '}ao longo de <span className="text-white font-semibold">
                  {simAnos ? `${simMeses} ano${simMeses > 1 ? 's' : ''}` : `${simMeses} mese${simMeses > 1 ? 's' : ''}`}
                </span>
              </div>
            )}
          </div>

          {/* Tabela comparativa */}
          {cenarios.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="p-4 border-b border-white/05">
                <h3 className="text-sm font-semibold text-slate-300">Comparativo de Investimentos</h3>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <Info size={11} />
                  Valores líquidos após IR. LCI/LCA isentos de IR.
                </p>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {cenarios.map((c, i) => (
                  <div key={c.nome}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.03] ${i === 0 ? 'bg-purple-950/20' : ''}`}>
                    <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: c.cor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{c.nome}</span>
                        {i === 0 && <span className="text-[10px] bg-purple-600/40 text-purple-300 px-2 py-0.5 rounded-full font-medium">Melhor</span>}
                        {c.isentoIR && <span className="text-[10px] bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Isento IR</span>}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        Taxa: {c.taxa.toFixed(2)}% a.a.
                        {c.ir > 0 && ` • IR: ${formatarMoeda(c.ir)}`}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-white tabular-nums">{formatarMoeda(c.totalLiquido)}</div>
                      <div className="text-xs text-emerald-400 tabular-nums">+{formatarMoeda(c.rendLiquido)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gráfico de projeção */}
          {projecaoGrafico.length > 1 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Projeção — Top 3 Opções</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={projecaoGrafico} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    {cenarios.slice(0, 3).map((c, i) => (
                      <linearGradient key={i} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c.cor} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={c.cor} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="periodo" tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `R$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    formatter={(v) => [formatarMoeda(Number(v)), '']}
                    contentStyle={{ background: '#0E1220', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: '#F1F5F9', fontSize: 12 }}
                  />
                  {cenarios.slice(0, 3).map((c, i) => (
                    <Area key={i} type="monotone" dataKey={c.nome}
                      stroke={c.cor} strokeWidth={2}
                      fill={`url(#grad${i})`} dot={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {cenarios.slice(0, 3).map((c, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-3 h-[2px] rounded inline-block" style={{ background: c.cor }} />
                    {c.nome}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA: CARTEIRA ─────────────────────────────── */}
      {aba === 'carteira' && (
        <div className="space-y-4">
          {/* Total */}
          <div className="glass-card p-5">
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Total Investido</div>
            <div className="text-3xl font-bold text-white tabular-nums">{formatarMoeda(totalCarteira)}</div>
            {selicAtual && totalCarteira > 0 && (
              <div className="mt-2 text-xs text-slate-500">
                Rendimento estimado/mês (Selic): <span className="text-emerald-400 font-semibold">
                  {formatarMoeda(totalCarteira * selicAtual / 100 / 12)}
                </span>
              </div>
            )}
          </div>

          {/* Botão adicionar */}
          <button onClick={() => setMostrarForm(v => !v)}
            className="btn-primary w-full flex items-center justify-center gap-2 text-white px-4 py-3 rounded-xl text-sm font-semibold">
            <Plus size={16} /> Adicionar Investimento
          </button>

          {/* Formulário */}
          {mostrarForm && (
            <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4 border-purple-500/30">
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Tipo de Investimento</label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_INV.map(t => (
                    <button key={t.valor} type="button"
                      onClick={() => setForm(f => ({ ...f, tipo: t.valor }))}
                      className={`text-left p-3 rounded-xl border text-xs transition-all ${
                        form.tipo === t.valor
                          ? 'border-purple-500 bg-purple-600/20 text-purple-300'
                          : 'border-white/08 bg-white/[0.03] text-slate-400 hover:text-white hover:border-white/15'
                      }`}>
                      <div className="font-semibold mb-0.5">{t.icone} {t.label}</div>
                      <div className="text-[10px] opacity-70">{t.descricao}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nome / Descrição *</label>
                <input type="text" required placeholder="Ex: CDB Nubank 110% CDI"
                  value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Valor (R$) *</label>
                  <input type="number" required min="0" step="0.01"
                    value={form.valor_investido} onChange={e => setForm(f => ({ ...f, valor_investido: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Taxa (% a.a.)</label>
                  <input type="number" step="0.01"
                    value={form.taxa_rendimento} onChange={e => setForm(f => ({ ...f, taxa_rendimento: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Banco/Corretora</label>
                  <input type="text" placeholder="Ex: Nubank, XP..."
                    value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Data Início</label>
                  <input type="date"
                    value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input type="checkbox" checked={form.isento_ir}
                  onChange={e => setForm(f => ({ ...f, isento_ir: e.target.checked }))}
                  className="rounded border-white/20 bg-white/5 accent-purple-500" />
                Isento de IR (LCI, LCA, Poupança)
              </label>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1 text-white py-2.5 rounded-xl text-sm font-semibold">Salvar</button>
                <button type="button" onClick={() => setMostrarForm(false)}
                  className="px-4 bg-white/5 text-slate-400 py-2.5 rounded-xl text-sm hover:bg-white/10 transition-colors">Cancelar</button>
              </div>
            </form>
          )}

          {/* Lista de investimentos */}
          {investimentos.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center py-12 text-slate-600">
              <TrendingUp size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-500">Nenhum investimento cadastrado</p>
              <p className="text-xs mt-1">Use o simulador para comparar antes de investir!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {investimentos.map(inv => {
                const tipo = TIPOS_INV.find(t => t.valor === inv.tipo);
                const rendMes = inv.taxa_rendimento
                  ? inv.valor_investido * (Math.pow(1 + inv.taxa_rendimento / 100, 1/12) - 1)
                  : selicAtual
                  ? inv.valor_investido * selicAtual / 100 / 12
                  : null;
                return (
                  <div key={inv.id} className="glass-card p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{tipo?.icone || '💰'}</div>
                        <div>
                          <div className="text-sm font-semibold text-white">{inv.nome}</div>
                          <div className="text-xs text-slate-500">
                            {tipo?.label}
                            {inv.banco && ` • ${inv.banco}`}
                            {inv.isento_ir && ' • Isento IR'}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => confirm('Excluir?') && excluirInvestimento(inv.id)}
                        className="text-slate-600 hover:text-red-400 p-1.5 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-500">Investido</div>
                        <div className="text-lg font-bold text-white tabular-nums">{formatarMoeda(inv.valor_investido)}</div>
                      </div>
                      {rendMes !== null && (
                        <div>
                          <div className="text-xs text-slate-500">Rend. estimado/mês</div>
                          <div className="text-lg font-bold text-emerald-400 tabular-nums">+{formatarMoeda(rendMes)}</div>
                        </div>
                      )}
                      {inv.taxa_rendimento && (
                        <div>
                          <div className="text-xs text-slate-500">Taxa</div>
                          <div className="text-sm font-semibold text-purple-400">{inv.taxa_rendimento}% a.a.</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
