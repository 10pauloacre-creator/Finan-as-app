'use client';

import { useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Wallet, Brain, ArrowRight,
  Eye, EyeOff, Plus, CreditCard, Building2, Sparkles,
  ArrowUpRight, ArrowDownLeft, RefreshCw,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda, mesAtual } from '@/lib/storage';
import { BANCO_INFO } from '@/types';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useState } from 'react';

type Pagina = 'dashboard' | 'transacoes' | 'bancos' | 'cartoes' | 'relatorios' | 'investimentos';
interface Props { onNovoPagina: (p: Pagina) => void; }

const CORES = ['#7C3AED','#10B981','#F59E0B','#EF4444','#3B82F6','#EC4899','#F97316','#8B5CF6'];
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export default function Dashboard({ onNovoPagina }: Props) {
  const { transacoes, categorias, contas, cartoes, dicasIA, setDicasIA, selicAtual } = useFinanceiroStore();
  const { mes, ano } = mesAtual();
  const [saldoOculto, setSaldoOculto] = useState(false);

  const dadosMes = useMemo(() => {
    const doMes = transacoes.filter(t => {
      const d = new Date(t.data);
      return d.getMonth() + 1 === mes && d.getFullYear() === ano;
    });
    const receitas  = doMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const despesas  = doMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
    const saldo     = receitas - despesas;

    // Pizza por categoria
    const porCat: Record<string, number> = {};
    doMes.filter(t => t.tipo === 'despesa').forEach(t => {
      const cat = categorias.find(c => c.id === t.categoria_id)?.nome || 'Outros';
      porCat[cat] = (porCat[cat] || 0) + t.valor;
    });
    const graficoPizza = Object.entries(porCat)
      .sort(([,a],[,b]) => b - a).slice(0, 6)
      .map(([nome, valor]) => ({ nome, valor }));

    // Área — últimos 6 meses
    const areaData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
      const m = d.getMonth() + 1; const a = d.getFullYear();
      const filtrado = transacoes.filter(t => {
        const td = new Date(t.data);
        return td.getMonth() + 1 === m && td.getFullYear() === a;
      });
      return {
        mes: MESES_ABREV[m - 1],
        receitas: filtrado.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0),
        despesas: filtrado.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0),
      };
    });

    return { receitas, despesas, saldo, graficoPizza, areaData, doMes };
  }, [transacoes, categorias, mes, ano]);

  const patrimonio = useMemo(() => {
    const saldoContas = contas.reduce((s, c) => s + c.saldo, 0);
    const faturaTotal = cartoes.reduce((s, c) => s + c.fatura_atual, 0);
    return saldoContas - faturaTotal;
  }, [contas, cartoes]);

  // Dicas automáticas
  useEffect(() => {
    if (dadosMes.doMes.length === 0) return;
    const dicas = [];
    if (dadosMes.despesas > dadosMes.receitas * 0.9 && dadosMes.receitas > 0) {
      dicas.push({ id:'1', tipo:'alerta' as const, titulo:'Gastos acima do ideal', mensagem:`Você usou ${((dadosMes.despesas/dadosMes.receitas)*100).toFixed(0)}% da sua renda. O ideal é manter abaixo de 80%.`, criado_em: new Date().toISOString() });
    }
    if (dadosMes.saldo > 0) {
      dicas.push({ id:'3', tipo:'conquista' as const, titulo:'Saldo positivo!', mensagem:`Você tem ${formatarMoeda(dadosMes.saldo)} sobrando. ${selicAtual ? `Investindo na Selic (${selicAtual}% a.a.) renderiam ${formatarMoeda(dadosMes.saldo * selicAtual / 100 / 12)}/mês.` : 'Considere investir!'}`, criado_em: new Date().toISOString() });
    }
    setDicasIA(dicas);
  }, [dadosMes, setDicasIA, selicAtual]);

  const ocultar = (v: string) => saldoOculto ? '••••••' : v;

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mb-1">Patrimônio Total</p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tabular-nums" style={{
              background: 'linear-gradient(135deg, #F1F5F9 0%, #A78BFA 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {saldoOculto ? 'R$ ••••••' : formatarMoeda(patrimonio)}
            </h1>
            <button onClick={() => setSaldoOculto(v => !v)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
              aria-label={saldoOculto ? 'Mostrar saldo' : 'Ocultar saldo'}>
              {saldoOculto ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            {MESES_ABREV[mes-1]} {ano} • {dadosMes.doMes.length} transações
          </p>
        </div>
        <div className="text-right">
          <div className={`text-sm font-semibold tabular-nums ${dadosMes.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {dadosMes.saldo >= 0 ? '+' : ''}{ocultar(formatarMoeda(dadosMes.saldo))}
          </div>
          <div className="text-slate-600 text-xs">saldo do mês</div>
        </div>
      </div>

      {/* ── Cards resumo ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-4" style={{ borderColor: 'rgba(16,185,129,0.2)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Entradas</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <ArrowDownLeft size={14} className="text-emerald-400" />
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-400 tabular-nums">{ocultar(formatarMoeda(dadosMes.receitas))}</div>
        </div>
        <div className="glass-card p-4" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Saídas</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <ArrowUpRight size={14} className="text-red-400" />
            </div>
          </div>
          <div className="text-xl font-bold text-red-400 tabular-nums">{ocultar(formatarMoeda(dadosMes.despesas))}</div>
        </div>
      </div>

      {/* ── Contas bancárias ─────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-300">Contas Bancárias</span>
          </div>
          <button onClick={() => onNovoPagina('bancos')}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors">
            Ver tudo <ArrowRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {contas.map(conta => {
            const info = BANCO_INFO[conta.banco];
            return (
              <button key={conta.id} onClick={() => onNovoPagina('bancos')}
                className="glass-card p-4 text-left w-full group relative overflow-hidden">
                {/* Barra colorida do banco */}
                <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
                  style={{ background: info.cor }} />
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: info.cor }}>
                    {info.nome.slice(0,2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{info.nome}</div>
                    <div className="text-[11px] text-slate-500 capitalize">{conta.tipo}</div>
                  </div>
                </div>
                <div className="text-xl font-bold tabular-nums text-white">
                  {ocultar(formatarMoeda(conta.saldo))}
                </div>
                <div className="text-xs text-slate-500 mt-1">{conta.nome}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Cartões de crédito ───────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CreditCard size={15} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-300">Cartões de Crédito</span>
          </div>
          <button onClick={() => onNovoPagina('cartoes')}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors">
            Ver tudo <ArrowRight size={12} />
          </button>
        </div>
        <div className="space-y-3">
          {cartoes.map(cartao => {
            const info = BANCO_INFO[cartao.banco];
            const pct = cartao.limite > 0 ? (cartao.fatura_atual / cartao.limite) * 100 : 0;
            const disponivel = cartao.limite - cartao.fatura_atual;
            const hoje = new Date().getDate();
            const diasVenc = cartao.dia_vencimento >= hoje
              ? cartao.dia_vencimento - hoje
              : 30 - hoje + cartao.dia_vencimento;

            return (
              <button key={cartao.id} onClick={() => onNovoPagina('cartoes')}
                className="glass-card p-4 w-full text-left relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
                  style={{ background: info.cor }} />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: info.cor }}>
                      {info.nome.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{cartao.nome}</div>
                      <div className="text-[11px] text-slate-500 capitalize">{cartao.bandeira}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold tabular-nums ${
                      pct > 80 ? 'text-red-400' : pct > 50 ? 'text-yellow-400' : 'text-white'
                    }`}>
                      {ocultar(formatarMoeda(cartao.fatura_atual))}
                    </div>
                    <div className="text-[11px] text-slate-500">fatura atual</div>
                  </div>
                </div>

                {/* Barra de limite */}
                <div className="mb-2">
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        background: pct > 80 ? '#EF4444' : pct > 50 ? '#F59E0B' : info.cor,
                      }} />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Disponível: <span className="text-emerald-400 font-medium">{ocultar(formatarMoeda(disponivel))}</span></span>
                  <span>Vence em <span className={`font-medium ${diasVenc <= 5 ? 'text-red-400' : 'text-slate-300'}`}>{diasVenc}d</span> • dia {cartao.dia_vencimento}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Gráficos ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Área — 6 meses */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Evolução — 6 meses</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dadosMes.areaData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
              <Tooltip
                formatter={(v) => [formatarMoeda(Number(v)), '']}
                contentStyle={{ background: '#0E1220', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: '#F1F5F9', fontSize: 12 }}
                labelStyle={{ color: '#94A3B8' }}
              />
              <Area type="monotone" dataKey="receitas" stroke="#10B981" strokeWidth={2} fill="url(#gradGreen)" dot={false} />
              <Area type="monotone" dataKey="despesas" stroke="#EF4444" strokeWidth={2} fill="url(#gradRed)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-1 justify-center text-xs">
            <span className="flex items-center gap-1.5 text-emerald-400"><span className="w-3 h-[2px] bg-emerald-400 rounded inline-block" />Entradas</span>
            <span className="flex items-center gap-1.5 text-red-400"><span className="w-3 h-[2px] bg-red-400 rounded inline-block" />Saídas</span>
          </div>
        </div>

        {/* Pizza — categorias */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Gastos por Categoria</h3>
          {dadosMes.graficoPizza.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={dadosMes.graficoPizza} cx="50%" cy="50%"
                    innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="valor">
                    {dadosMes.graficoPizza.map((_, i) => (
                      <Cell key={i} fill={CORES[i % CORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [formatarMoeda(Number(v)), '']}
                    contentStyle={{ background: '#0E1220', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: '#F1F5F9', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                {dadosMes.graficoPizza.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CORES[i] }} />
                    <span className="text-slate-400 truncate flex-1">{item.nome}</span>
                    <span className="text-slate-300 tabular-nums">{formatarMoeda(item.valor)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-slate-600">
              <Wallet size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Sem gastos registrados</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Painel IA ────────────────────────────────── */}
      {dicasIA.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={15} className="text-purple-400" />
            <span className="text-sm font-semibold text-slate-300">Análise da IA</span>
          </div>
          <div className="space-y-2">
            {dicasIA.map(dica => (
              <div key={dica.id} className={`glass-card p-4 text-sm ${
                dica.tipo === 'alerta'    ? 'border-red-500/20' :
                dica.tipo === 'conquista' ? 'border-emerald-500/20' :
                                           'border-purple-500/20'
              }`}>
                <div className="font-semibold text-white mb-1">{dica.titulo}</div>
                <div className="text-slate-400 text-sm leading-relaxed">{dica.mensagem}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Últimas transações ───────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-300">Últimas Transações</span>
          <button onClick={() => onNovoPagina('transacoes')}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors">
            Ver todas <ArrowRight size={12} />
          </button>
        </div>
        <div className="space-y-2">
          {dadosMes.doMes.slice(0, 8).map(t => {
            const cat = categorias.find(c => c.id === t.categoria_id);
            return (
              <div key={t.id} className="glass-card flex items-center gap-3 p-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
                  style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)', color: cat?.cor || '#94A3B8' }}>
                  {cat?.icone || '💳'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{t.descricao}</div>
                  <div className="text-xs text-slate-500">
                    {cat?.nome || 'Outros'}
                    {t.metodo_pagamento && ` • ${t.metodo_pagamento}`}
                    {' • '}{new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })}
                  </div>
                </div>
                <div className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
                  t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {t.tipo === 'receita' ? '+' : '-'}{formatarMoeda(t.valor)}
                </div>
              </div>
            );
          })}
          {dadosMes.doMes.length === 0 && (
            <div className="glass-card flex flex-col items-center justify-center py-12 text-slate-600">
              <Wallet size={36} className="mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-500">Nenhuma transação este mês</p>
              <p className="text-xs mt-1 text-slate-600">Use o botão + ou mande áudio no WhatsApp</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
