'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { calcularPrevisao } from '@/lib/previsao';
import { formatarMoeda } from '@/lib/storage';
import type { Transacao } from '@/types';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface DiaInfo {
  dia: number;
  data: string; // YYYY-MM-DD
  transacoes: Transacao[];
  totalReceitas: number;
  totalDespesas: number;
  saldoDia: number;
  temPrevisao: boolean;
  previsaoDescricao?: string;
  previsaoValor?: number;
  foraDoMes: boolean;
}

export default function Calendario() {
  const { transacoes, categorias } = useFinanceiroStore();
  const hoje = new Date();

  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  const [anoSel, setAnoSel] = useState(hoje.getFullYear());
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  function mesAnterior() {
    if (mesSel === 1) { setMesSel(12); setAnoSel(a => a - 1); }
    else setMesSel(m => m - 1);
  }

  function proximoMes() {
    if (mesSel === 12) { setMesSel(1); setAnoSel(a => a + 1); }
    else setMesSel(m => m + 1);
  }

  // Previsoes para o mes selecionado
  const previsoes = useMemo(() => {
    return calcularPrevisao(transacoes, 60);
  }, [transacoes]);

  const previstasDoMes = useMemo(() => {
    return previsoes.filter(p => {
      const d = new Date(p.data + 'T00:00:00');
      return d.getMonth() + 1 === mesSel && d.getFullYear() === anoSel;
    });
  }, [previsoes, mesSel, anoSel]);

  // Build calendar grid
  const diasCalendario = useMemo((): DiaInfo[] => {
    const primeiroDia = new Date(anoSel, mesSel - 1, 1);
    const ultimoDia = new Date(anoSel, mesSel, 0);
    const diaSemanaInicio = primeiroDia.getDay(); // 0=Dom

    const dias: DiaInfo[] = [];

    // Dias do mes anterior para completar a primeira semana
    for (let i = 0; i < diaSemanaInicio; i++) {
      const d = new Date(anoSel, mesSel - 1, -diaSemanaInicio + 1 + i);
      const dataStr = d.toISOString().split('T')[0];
      dias.push({
        dia: d.getDate(),
        data: dataStr,
        transacoes: [],
        totalReceitas: 0,
        totalDespesas: 0,
        saldoDia: 0,
        temPrevisao: false,
        foraDoMes: true,
      });
    }

    // Dias do mes atual
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const dataDate = new Date(anoSel, mesSel - 1, d);
      const dataStr = `${anoSel}-${String(mesSel).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      const txDia = transacoes.filter(t => t.data === dataStr);
      const totalReceitas = txDia.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
      const totalDespesas = txDia.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);

      const prevDia = previstasDoMes.find(p => p.data === dataStr);
      const eFuturo = dataDate > hoje;

      dias.push({
        dia: d,
        data: dataStr,
        transacoes: txDia,
        totalReceitas,
        totalDespesas,
        saldoDia: totalReceitas - totalDespesas,
        temPrevisao: eFuturo && !!prevDia,
        previsaoDescricao: prevDia?.descricao,
        previsaoValor: prevDia?.valor,
        foraDoMes: false,
      });
    }

    // Completar ultima semana
    const restante = 7 - (dias.length % 7);
    if (restante < 7) {
      for (let i = 1; i <= restante; i++) {
        const d = new Date(anoSel, mesSel, i);
        const dataStr = d.toISOString().split('T')[0];
        dias.push({
          dia: i,
          data: dataStr,
          transacoes: [],
          totalReceitas: 0,
          totalDespesas: 0,
          saldoDia: 0,
          temPrevisao: false,
          foraDoMes: true,
        });
      }
    }

    return dias;
  }, [transacoes, mesSel, anoSel, previstasDoMes, hoje]);

  // Resumo do mes
  const resumoMes = useMemo(() => {
    const txMes = transacoes.filter(t => {
      const d = new Date(t.data + 'T00:00:00');
      return d.getMonth() + 1 === mesSel && d.getFullYear() === anoSel;
    });
    const receitas = txMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const despesas = txMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
    return { qtd: txMes.length, receitas, despesas, saldo: receitas - despesas };
  }, [transacoes, mesSel, anoSel]);

  const diaDetalhe = diaSelecionado
    ? diasCalendario.find(d => d.data === diaSelecionado)
    : null;

  const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Calendário Financeiro</h2>
      </div>

      {/* Navegacao mes */}
      <div className="flex items-center justify-between bg-[#0F1629] border border-white/[0.06] rounded-2xl px-5 py-3">
        <button
          onClick={mesAnterior}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all"
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-base font-semibold text-white">
          {MESES_NOMES[mesSel - 1]} {anoSel}
        </h3>
        <button
          onClick={proximoMes}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Grid do calendario */}
      <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl overflow-hidden">
        {/* Cabecalho dias da semana */}
        <div className="grid grid-cols-7 border-b border-white/[0.06]">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Celulas dos dias */}
        <div className="grid grid-cols-7">
          {diasCalendario.map((info, idx) => {
            const eHoje = info.data === dataHoje;
            const eSelecionado = info.data === diaSelecionado;
            const temTx = info.transacoes.length > 0;

            // Dots para exibir (max 3)
            const despesas = info.transacoes.filter(t => t.tipo === 'despesa').slice(0, 3);
            const receitas = info.transacoes.filter(t => t.tipo === 'receita').slice(0, 3 - despesas.length);

            const borderClass = info.temPrevisao
              ? 'border border-dashed border-amber-500/40'
              : eHoje
              ? 'border border-purple-500/60'
              : eSelecionado
              ? 'border border-purple-400/40'
              : 'border border-transparent';

            return (
              <button
                key={idx}
                onClick={() => !info.foraDoMes && setDiaSelecionado(
                  eSelecionado ? null : info.data
                )}
                className={`
                  min-h-[52px] lg:min-h-[72px] p-1.5 text-left flex flex-col gap-0.5 relative
                  transition-colors duration-100 rounded-lg m-0.5
                  ${info.foraDoMes ? 'opacity-20 cursor-default' : 'cursor-pointer hover:bg-white/[0.04]'}
                  ${eSelecionado ? 'bg-purple-600/10' : ''}
                  ${eHoje ? 'bg-purple-600/5' : ''}
                  ${borderClass}
                `}
              >
                {/* Numero do dia */}
                <span className={`text-xs font-semibold leading-none ${
                  eHoje ? 'text-purple-300' : info.foraDoMes ? 'text-slate-600' : 'text-slate-300'
                }`}>
                  {info.dia}
                </span>

                {/* Dots de transacoes */}
                {temTx && (
                  <div className="flex gap-0.5 flex-wrap">
                    {despesas.map((_, i) => (
                      <span key={`d${i}`} className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    ))}
                    {receitas.map((_, i) => (
                      <span key={`r${i}`} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    ))}
                  </div>
                )}

                {/* Dot de previsao */}
                {info.temPrevisao && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}

                {/* Saldo do dia */}
                {temTx && (
                  <span className={`text-[9px] font-medium leading-none hidden lg:block ${
                    info.saldoDia >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {info.saldoDia >= 0 ? '+' : ''}{formatarMoeda(Math.abs(info.saldoDia)).replace('R$ ', '')}
                  </span>
                )}

                {/* Label previsto */}
                {info.temPrevisao && !temTx && (
                  <span className="text-[9px] text-amber-500 leading-none hidden lg:block">
                    Previsto
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel de detalhe do dia */}
      {diaDetalhe && !diaDetalhe.foraDoMes && (
        <div className="bg-[#0F1629] border border-purple-500/20 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">
              Transacoes de {new Date(diaDetalhe.data + 'T12:00:00').toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'long',
              })}
            </h4>
            <button
              onClick={() => setDiaSelecionado(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {diaDetalhe.transacoes.length === 0 && !diaDetalhe.temPrevisao && (
            <p className="text-sm text-slate-600 text-center py-4">
              Nenhuma transacao neste dia
            </p>
          )}

          <div className="space-y-2">
            {diaDetalhe.transacoes.map(t => {
              const cat = categorias.find(c => c.id === t.categoria_id);
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <span className="text-lg flex-shrink-0">{cat?.icone ?? '💳'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{t.descricao}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {cat?.nome ?? 'Sem categoria'}
                      {t.metodo_pagamento && ` • ${t.metodo_pagamento}`}
                    </p>
                  </div>
                  <span className={`text-sm font-bold flex-shrink-0 ${
                    t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {t.tipo === 'receita' ? '+' : '-'}{formatarMoeda(t.valor)}
                  </span>
                </div>
              );
            })}

            {diaDetalhe.temPrevisao && (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3">
                <span className="text-lg flex-shrink-0">⏰</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-200 truncate">
                    {diaDetalhe.previsaoDescricao ?? 'Cobrança prevista'}
                  </p>
                  <p className="text-xs text-amber-500/70 mt-0.5">Previsto</p>
                </div>
                <span className="text-sm font-bold text-amber-400 flex-shrink-0">
                  -{formatarMoeda(diaDetalhe.previsaoValor ?? 0)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resumo do mes */}
      <div className="bg-[#0A0E1A] border border-white/[0.06] rounded-2xl px-5 py-3">
        <p className="text-xs text-slate-500 text-center">
          <span className="text-white font-medium">{MESES_NOMES[mesSel - 1]}:</span>
          {' '}{resumoMes.qtd} transacoes{' '}
          <span className="text-slate-600">·</span>
          {' '}Receitas <span className="text-emerald-400 font-medium">{formatarMoeda(resumoMes.receitas)}</span>
          {' '}<span className="text-slate-600">·</span>
          {' '}Despesas <span className="text-red-400 font-medium">{formatarMoeda(resumoMes.despesas)}</span>
          {' '}<span className="text-slate-600">·</span>
          {' '}Saldo <span className={`font-medium ${resumoMes.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatarMoeda(resumoMes.saldo)}
          </span>
        </p>
      </div>
    </div>
  );
}
