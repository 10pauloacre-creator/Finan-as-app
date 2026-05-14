'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Edit, Plus, Search, Trash2 } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { ContaBancaria, CartaoCredito, Transacao } from '@/types';
import ModalNovaTransacao from '@/components/modais/ModalNovaTransacao';
import ModalDetalheTransacao from '@/components/modais/ModalDetalheTransacao';
import { formatFinancialDate, parseFinancialDate, startOfTodayLocal } from '@/lib/date';
import {
  aplicarDataCompetenciaNaTransacao,
  calcularDataFinalParcelamento,
  calcularGastoRecorrenteAnual,
  calcularParcelamentoInfo,
  getDataCompetenciaDespesa,
  getDataCobrancaCartao,
  getDataOcorrenciaNoMes,
  transacaoContaNoMesAteData,
  transacaoJaOcorreuAteData,
} from '@/lib/transacoes';

// ─── Timeline de Gastos ──────────────────────────────────────────────────────
const TG_CARD_W = 140;
const TG_CARD_GAP = 12;
const TG_CARD_STEP = TG_CARD_W + TG_CARD_GAP;
const TG_CARD_H = 178;
const TG_DOT_TOP = 22;
const TG_DOT_BOT = 110;

type TransacaoPrevista = {
  uid: string;
  transacao: import('@/types').Transacao;
  dataOcorrencia: string;
  status: 'debitada' | 'prevista' | 'ativa';
  parcelaLabel?: string;
  tipoLabel: 'Recorrente' | 'Parcela' | 'Agendada';
};

type DadosMesGastos = {
  mes: string;
  label: string;
  ano: string;
  total: number;
  tipo: 'passado' | 'atual' | 'futuro';
  por_categoria: { id: string; nome: string; icone: string; cor: string; valor: number }[];
  transacoes_previstas: TransacaoPrevista[];
};

function tgAddMeses(mesKey: string, n: number): string {
  const [y, m] = mesKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function tgMesAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function tgDotY(valor: number, maxValor: number): number {
  if (maxValor === 0) return (TG_DOT_TOP + TG_DOT_BOT) / 2;
  const norm = Math.min(valor / maxValor, 1);
  return TG_DOT_BOT - norm * (TG_DOT_BOT - TG_DOT_TOP);
}

function tgBuildPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x} ${pts[0].y}` : '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + TG_CARD_STEP * 0.4;
    const cp2x = pts[i].x - TG_CARD_STEP * 0.4;
    d += ` C ${cp1x} ${pts[i - 1].y}, ${cp2x} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

function tgCorPorTotal(total: number) {
  const proporcao = Math.max(0, Math.min(total / 7000, 1));
  const origem = { r: 16, g: 185, b: 129 };
  const destino = { r: 69, g: 10, b: 10 };
  const r = Math.round(origem.r + (destino.r - origem.r) * proporcao);
  const g = Math.round(origem.g + (destino.g - origem.g) * proporcao);
  const b = Math.round(origem.b + (destino.b - origem.b) * proporcao);
  return `rgb(${r}, ${g}, ${b})`;
}

function tgFundoPorTotal(total: number) {
  const cor = tgCorPorTotal(total).replace('rgb(', '').replace(')', '');
  return `rgba(${cor}, 0.12)`;
}

function tgBordaPorTotal(total: number) {
  const cor = tgCorPorTotal(total).replace('rgb(', '').replace(')', '');
  return `rgba(${cor}, 0.38)`;
}

function getParcelaLabelNoMes(transacao: Transacao, dataOcorrencia: string) {
  if (!transacao.parcelas || transacao.parcelas <= 1) return undefined;
  const base = parseFinancialDate(transacao.data);
  const atual = parseFinancialDate(dataOcorrencia);
  const deslocamento = (atual.getFullYear() - base.getFullYear()) * 12 + (atual.getMonth() - base.getMonth());
  const numeroParcela = Math.min((transacao.parcela_atual || 0) + deslocamento + 1, transacao.parcelas);
  return `${Math.max(numeroParcela, 1)}/${transacao.parcelas}`;
}

function calcularTimelineGastos(
  transacoes: import('@/types').Transacao[],
  categorias: import('@/types').Categoria[],
  cartoes: CartaoCredito[],
): DadosMesGastos[] {
  const hoje = tgMesAtual();
  const referenciaHoje = startOfTodayLocal();

  const todosMeses: string[] = [];
  for (let i = -2; i <= 10; i++) todosMeses.push(tgAddMeses(hoje, i));

  return todosMeses.map((mes) => {
    const [year, month] = mes.split('-').map(Number);
    const tipo: DadosMesGastos['tipo'] = mes < hoje ? 'passado' : mes === hoje ? 'atual' : 'futuro';
    const catMap: Record<string, number> = {};
    const txPrevistas: TransacaoPrevista[] = [];

    transacoes.forEach((tx) => {
      // Passado e atual: soma transações com data no mês
      if (tx.tipo !== 'despesa') return;

      const cartao = tx.cartao_id ? cartoes.find((item) => item.id === tx.cartao_id) : undefined;
      const transacaoCompetencia = aplicarDataCompetenciaNaTransacao(tx, cartao);
      const ocorrencia = getDataOcorrenciaNoMes(transacaoCompetencia, month, year);
      if (!ocorrencia) return;

      const dataOcorrencia = formatFinancialDate(ocorrencia);
      const status: TransacaoPrevista['status'] = tipo === 'futuro'
        ? (tx.cartao_id ? 'ativa' : 'prevista')
        : tipo === 'atual'
          ? (ocorrencia <= referenciaHoje ? 'debitada' : tx.cartao_id ? 'ativa' : 'prevista')
          : 'debitada';

      catMap[tx.categoria_id] = (catMap[tx.categoria_id] || 0) + tx.valor;
      txPrevistas.push({
        uid: `${tx.id}-${mes}-${dataOcorrencia}`,
        transacao: tx,
        dataOcorrencia,
        status,
        parcelaLabel: getParcelaLabelNoMes(transacaoCompetencia, dataOcorrencia),
        tipoLabel: tx.classificacao === 'fixa'
          ? 'Recorrente'
          : (tx.parcelas || 1) > 1
            ? 'Parcela'
            : 'Agendada',
      });
    });

    const por_categoria = Object.entries(catMap)
      .map(([catId, valor]) => {
        const cat = categorias.find((c) => c.id === catId);
        return { id: catId, nome: cat?.nome || 'Outros', icone: cat?.icone || '$', cor: cat?.cor || '#6B7280', valor };
      })
      .sort((a, b) => b.valor - a.valor);

    txPrevistas.sort((a, b) => a.dataOcorrencia.localeCompare(b.dataOcorrencia) || a.transacao.descricao.localeCompare(b.transacao.descricao));

    return {
      mes,
      label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][month - 1],
      ano: String(year),
      total: por_categoria.reduce((s, c) => s + c.valor, 0),
      tipo,
      por_categoria,
      transacoes_previstas: txPrevistas,
    };
  });
}

function TimelineGastos({
  transacoes,
  categorias,
  cartoes,
}: {
  transacoes: import('@/types').Transacao[];
  categorias: import('@/types').Categoria[];
  cartoes: CartaoCredito[];
}) {
  const dados = useMemo(() => calcularTimelineGastos(transacoes, categorias, cartoes), [transacoes, categorias, cartoes]);
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const atualIdx = dados.findIndex((d) => d.tipo === 'atual');
    if (atualIdx < 0) return;
    const containerW = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = Math.max(0, atualIdx * TG_CARD_STEP - containerW / 2 + TG_CARD_W / 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxValor = Math.max(...dados.map((d) => d.total), 1);
  const totalW = dados.length * TG_CARD_STEP - TG_CARD_GAP;
  const atualIdx = dados.findIndex((d) => d.tipo === 'atual');

  const points = dados.map((d, i) => ({
    x: i * TG_CARD_STEP + TG_CARD_W / 2,
    y: tgDotY(d.total, maxValor),
  }));

  const pastPath = tgBuildPath(points.slice(0, atualIdx + 1));
  const futurePath = atualIdx >= 0 ? tgBuildPath(points.slice(atualIdx)) : '';

  const mesSel = mesSelecionado ? dados.find((d) => d.mes === mesSelecionado) : null;

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Estimativa de Gastos por Mês</h3>
      <p className="text-[11px] text-slate-600 mb-4">Despesas realizadas e projeção de parcelas futuras</p>

      <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1" style={{ scrollBehavior: 'smooth' }}>
        <div className="relative" style={{ width: totalW, height: TG_CARD_H }}>
          <svg
            width={totalW}
            height={TG_CARD_H}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 2 }}
          >
            <path d={pastPath} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />

            {futurePath && (
              <path d={futurePath} fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 4" />
            )}

            {points.map((pt, i) => {
              const d = dados[i];
              const isAtual = d.tipo === 'atual';
              const isPast = d.tipo === 'passado';
              const corMes = tgCorPorTotal(d.total);
              return (
                <g key={d.mes}>
                  {isAtual && <circle cx={pt.x} cy={pt.y} r={12} fill={tgFundoPorTotal(d.total)} />}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isAtual ? 6 : 5}
                    fill={isPast ? corMes : isAtual ? 'white' : 'transparent'}
                    stroke={isAtual ? corMes : isPast ? corMes : '#6B7280'}
                    strokeWidth={isAtual ? 2.5 : 1.5}
                  />
                </g>
              );
            })}
          </svg>

          {dados.map((d, i) => {
            const isAtual = d.tipo === 'atual';
            const isFuturo = d.tipo === 'futuro';
            const isSel = mesSelecionado === d.mes;
            const corMes = tgCorPorTotal(d.total);
            return (
              <button
                key={d.mes}
                type="button"
                onClick={() => setMesSelecionado((prev) => (prev === d.mes ? null : d.mes))}
                className="absolute flex flex-col items-center justify-end pb-4 rounded-2xl transition-all hover:bg-white/5"
                style={{ left: i * TG_CARD_STEP, top: 0, width: TG_CARD_W, height: TG_CARD_H, zIndex: 1 }}
              >
                <div
                  className="absolute inset-0 rounded-2xl border"
                  style={{
                    background: isAtual || isSel ? tgFundoPorTotal(d.total) : 'rgba(255,255,255,0.02)',
                    borderColor: isAtual || isSel ? tgBordaPorTotal(d.total) : 'rgba(255,255,255,0.06)',
                    borderWidth: isAtual ? 2 : 1,
                  }}
                />
                <div className="relative text-xs font-semibold mb-1" style={{ color: d.total > 0 ? corMes : isFuturo ? '#64748B' : '#94A3B8' }}>
                  {d.label}
                </div>
                <div className="relative text-sm font-bold tabular-nums" style={{ color: d.total > 0 ? corMes : isFuturo ? '#64748B' : '#FFFFFF' }}>
                  {formatarMoeda(d.total)}
                </div>
                <div className="relative text-[10px] text-slate-600 mt-0.5">
                  {isFuturo ? 'estimado' : isAtual ? 'no mes' : 'fechado'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {mesSel && (mesSel.por_categoria.length > 0 || mesSel.transacoes_previstas.length > 0) && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500">
              {mesSel.label} {mesSel.ano}
              {mesSel.tipo === 'futuro' && ' — despesas previstas'}
              {mesSel.tipo === 'passado' && ' — despesas do mês'}
              {mesSel.tipo === 'atual' && ' — despesas até agora'}
            </span>
            <span className="text-xs font-semibold text-white tabular-nums">{formatarMoeda(mesSel.total)}</span>
          </div>

          {/* Future months: show individual transaction list */}
          {mesSel.tipo === 'futuro' && mesSel.transacoes_previstas.length > 0 && (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {mesSel.transacoes_previstas.map((item) => {
                const cat = item.transacao.categoria_id
                  ? categorias.find((c) => c.id === item.transacao.categoria_id)
                  : null;
                return (
                  <div key={item.uid} className="flex items-center gap-2.5 rounded-xl bg-white/4 px-3 py-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                      style={{ background: cat ? `${cat.cor}22` : 'rgba(255,255,255,0.06)' }}>
                      {cat?.icone || '$'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">{item.transacao.descricao}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          item.tipoLabel === 'Recorrente' ? 'bg-purple-500/20 text-purple-300' :
                          item.tipoLabel === 'Parcela' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-amber-500/20 text-amber-300'
                        }`}>{item.tipoLabel}{item.parcelaLabel ? ` ${item.parcelaLabel}` : ''}</span>
                        {cat && <span className="text-[10px] text-slate-600 truncate">{cat.nome}</span>}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-red-400 tabular-nums shrink-0">
                      -{formatarMoeda(item.transacao.valor)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Past/current months: show category breakdown */}
          {mesSel.tipo !== 'futuro' && (
            <div className="space-y-2">
              {mesSel.por_categoria.slice(0, 6).map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: `${c.cor}22` }}>{c.icone}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-300 truncate">{c.nome}</span>
                      <span className="text-xs font-semibold text-white tabular-nums shrink-0">{formatarMoeda(c.valor)}</span>
                    </div>
                    <div className="mt-1 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{ width: `${(c.valor / mesSel.total) * 100}%`, background: c.cor, opacity: 0.7 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Timeline de Receitas ────────────────────────────────────────────────────
function calcularTimelineReceitas(
  transacoes: import('@/types').Transacao[],
  categorias: import('@/types').Categoria[],
): DadosMesGastos[] {
  const hoje = tgMesAtual();
  const [hojeY, hojeM] = hoje.split('-').map(Number);
  const maxFuturo = Math.max((2027 - hojeY) * 12 + (12 - hojeM), 2);

  const todosMeses: string[] = [];
  for (let i = -3; i <= maxFuturo; i++) todosMeses.push(tgAddMeses(hoje, i));

  return todosMeses.map((mes) => {
    const [year, month] = mes.split('-').map(Number);
    const tipo: DadosMesGastos['tipo'] = mes < hoje ? 'passado' : mes === hoje ? 'atual' : 'futuro';
    const catMap: Record<string, number> = {};

    if (tipo !== 'futuro') {
      transacoes.forEach((tx) => {
        if (tx.tipo !== 'receita' || !tx.data.startsWith(mes)) return;
        catMap[tx.categoria_id] = (catMap[tx.categoria_id] || 0) + tx.valor;
      });
    } else {
      // Future: recurring receitas + installments
      transacoes.forEach((tx) => {
        if (tx.tipo !== 'receita') return;
        if (tx.classificacao === 'fixa') {
          catMap[tx.categoria_id] = (catMap[tx.categoria_id] || 0) + tx.valor;
          return;
        }
        if (tx.parcelas && tx.parcelas > 1) {
          const parcelaAtual = tx.parcela_atual || 1;
          const primeiroMes = tgAddMeses(tx.data.substring(0, 7), 1 - parcelaAtual);
          const ultimoMes = tgAddMeses(primeiroMes, tx.parcelas - 1);
          if (!tx.data.startsWith(mes) && mes >= primeiroMes && mes <= ultimoMes) {
            catMap[tx.categoria_id] = (catMap[tx.categoria_id] || 0) + tx.valor;
          }
        }
      });
    }

    const por_categoria = Object.entries(catMap)
      .map(([catId, valor]) => {
        const cat = categorias.find((c) => c.id === catId);
        return { id: catId, nome: cat?.nome || 'Outros', icone: cat?.icone || '💰', cor: cat?.cor || '#10B981', valor };
      })
      .sort((a, b) => b.valor - a.valor);

    return {
      mes,
      label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][month - 1],
      ano: String(year),
      total: por_categoria.reduce((s, c) => s + c.valor, 0),
      tipo,
      por_categoria,
      transacoes_previstas: [],
    };
  });
}

function TimelineReceitas({
  transacoes,
  categorias,
}: {
  transacoes: import('@/types').Transacao[];
  categorias: import('@/types').Categoria[];
}) {
  const dados = useMemo(() => calcularTimelineReceitas(transacoes, categorias), [transacoes, categorias]);
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const atualIdx = dados.findIndex((d) => d.tipo === 'atual');
    if (atualIdx < 0) return;
    const containerW = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = Math.max(0, atualIdx * TG_CARD_STEP - containerW / 2 + TG_CARD_W / 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxValor = Math.max(...dados.map((d) => d.total), 1);
  const totalW = dados.length * TG_CARD_STEP - TG_CARD_GAP;
  const atualIdx = dados.findIndex((d) => d.tipo === 'atual');
  const points = dados.map((d, i) => ({ x: i * TG_CARD_STEP + TG_CARD_W / 2, y: tgDotY(d.total, maxValor) }));
  const pastPath = tgBuildPath(points.slice(0, atualIdx + 1));
  const futurePath = atualIdx >= 0 ? tgBuildPath(points.slice(atualIdx)) : '';
  const mesSel = mesSelecionado ? dados.find((d) => d.mes === mesSelecionado) : null;

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Histórico e Projeção de Receitas</h3>
      <p className="text-[11px] text-slate-600 mb-4">Entradas realizadas e projeção de receitas fixas e parceladas</p>

      <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1" style={{ scrollBehavior: 'smooth' }}>
        <div className="relative" style={{ width: totalW, height: TG_CARD_H }}>
          <svg width={totalW} height={TG_CARD_H} className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
            <defs>
              <linearGradient id="trFillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {atualIdx >= 0 && (
              <path
                d={`M ${atualIdx * TG_CARD_STEP} ${TG_CARD_H} L ${atualIdx * TG_CARD_STEP} ${points[atualIdx].y} L ${atualIdx * TG_CARD_STEP + TG_CARD_W} ${points[atualIdx].y} L ${atualIdx * TG_CARD_STEP + TG_CARD_W} ${TG_CARD_H} Z`}
                fill="url(#trFillGrad)"
              />
            )}
            <path d={pastPath} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
            {futurePath && <path d={futurePath} fill="none" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 4" />}
            {points.map((pt, i) => {
              const d = dados[i];
              const isAtual = d.tipo === 'atual';
              const isPast = d.tipo === 'passado';
              return (
                <g key={d.mes}>
                  {isAtual && <circle cx={pt.x} cy={pt.y} r={12} fill="#10B981" fillOpacity="0.12" />}
                  <circle cx={pt.x} cy={pt.y} r={isAtual ? 6 : 5}
                    fill={isPast ? '#10B981' : isAtual ? 'white' : 'transparent'}
                    stroke={isPast ? '#10B981' : isAtual ? '#10B981' : '#6B7280'}
                    strokeWidth={isAtual ? 2.5 : 1.5}
                  />
                </g>
              );
            })}
          </svg>

          {dados.map((d, i) => {
            const isAtual = d.tipo === 'atual';
            const isFuturo = d.tipo === 'futuro';
            const isSel = mesSelecionado === d.mes;
            return (
              <button key={d.mes} type="button"
                onClick={() => setMesSelecionado((prev) => (prev === d.mes ? null : d.mes))}
                className={`absolute flex flex-col items-center justify-end pb-4 rounded-2xl transition-all ${
                  isAtual ? 'border-2 border-emerald-500/50 bg-emerald-500/5'
                    : isSel ? 'border border-purple-500/40 bg-white/4'
                    : 'border border-white/5 bg-white/2 hover:bg-white/5'
                }`}
                style={{ left: i * TG_CARD_STEP, top: 0, width: TG_CARD_W, height: TG_CARD_H, zIndex: 1 }}
              >
                <div className={`text-xs font-semibold mb-1 ${isAtual ? 'text-emerald-400' : isFuturo ? 'text-slate-500' : 'text-slate-400'}`}>{d.label}</div>
                <div className={`text-sm font-bold tabular-nums ${isAtual ? 'text-emerald-300' : isFuturo ? 'text-slate-500' : 'text-white'}`}>
                  {formatarMoeda(d.total)}
                </div>
                {isFuturo && d.total > 0 && <div className="text-[10px] text-slate-600 mt-0.5">estimado</div>}
              </button>
            );
          })}
        </div>
      </div>

      {mesSel && mesSel.por_categoria.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="text-xs text-slate-500 mb-3">
            {mesSel.label} {mesSel.ano}
            {mesSel.tipo === 'futuro' && ' — projeção de receitas fixas'}
            {mesSel.tipo === 'passado' && ' — receitas do mês'}
            {mesSel.tipo === 'atual' && ' — receitas até agora'}
          </div>
          <div className="space-y-2">
            {mesSel.por_categoria.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: `${c.cor}22` }}>{c.icone}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-300 truncate">{c.nome}</span>
                    <span className="text-xs font-semibold text-emerald-400 tabular-nums shrink-0">+{formatarMoeda(c.valor)}</span>
                  </div>
                  <div className="mt-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(c.valor / mesSel.total) * 100}%`, background: c.cor, opacity: 0.7 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const FILTROS_TIPO = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'despesa', label: 'Despesas' },
  { valor: 'receita', label: 'Receitas' },
];

const DIAS_SEMANA_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type FiltroLinha2 = 'todas' | 'padrao' | 'fixa' | 'assinaturas' | 'ja_debitadas' | 'previstas';
type VisuTab = 'despesas' | 'receitas';
type TransacaoExibicao = {
  transacao: Transacao;
  dataExibicao: string;
  dataOrdenacao: string;
};

function aplicarDataDeExibicaoNaTransacao(transacao: Transacao, dataExibicao: string): Transacao {
  if (transacao.tipo !== 'despesa') return transacao;
  return {
    ...transacao,
    data: dataExibicao,
    data_cobranca: dataExibicao,
  };
}

const FILTROS_LINHA2: { valor: FiltroLinha2; label: string }[] = [
  { valor: 'todas',        label: 'Todas' },
  { valor: 'padrao',       label: 'Normais' },
  { valor: 'fixa',         label: 'Fixas' },
  { valor: 'assinaturas',  label: 'Assinaturas' },
  { valor: 'ja_debitadas', label: '✓ Já debitadas' },
  { valor: 'previstas',    label: '⏱ Previstas' },
];

const LABEL_FILTRO_DESPESA: Record<FiltroLinha2, string> = {
  todas: 'Total do mês',
  padrao: 'Total de gastos normais',
  fixa: 'Total de gastos fixos',
  assinaturas: 'Total de assinaturas',
  ja_debitadas: 'Total já debitado',
  previstas: 'Total previsto',
};

const METODOS_DEBITO = new Set(['pix', 'debito', 'transferencia', 'dinheiro', 'emprestimo', 'financiamento']);

function getClassificacaoTransacao(transacao: Transacao): 'padrao' | 'fixa' | 'futura' {
  return transacao.classificacao || 'padrao';
}

function isTransacaoAssinatura(transacao: Transacao) {
  return transacao.tipo === 'despesa' && transacao.categoria_id === 'assinaturas';
}

function getBadgeClassificacao(transacao: Transacao, hoje: Date, dataExibicao?: string) {
  if (transacao.cartao_id && transacao.tipo === 'despesa') {
    const referencia = parseFinancialDate(dataExibicao || transacao.data);
    const ativa = referencia > hoje;
    return {
      label: ativa ? 'Cartao ativo' : 'Cartao ja cobrado',
      className: ativa
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/20'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    };
  }

  const classificacao = getClassificacaoTransacao(transacao);
  const realizada = transacaoJaOcorreuAteData(
    dataExibicao ? aplicarDataDeExibicaoNaTransacao(transacao, dataExibicao) : transacao,
    hoje,
  );

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


export default function Transacoes() {
  const { transacoes, categorias, contas, cartoes, excluirTransacao } = useFinanceiroStore();

  const [visuTab, setVisuTab] = useState<VisuTab>('despesas');
  const [busca, setBusca] = useState('');
  const [filtroMeses, setFiltroMeses] = useState<number[]>([new Date().getMonth() + 1]);
  const [filtroAnos, setFiltroAnos] = useState<number[] | 'todos'>([new Date().getFullYear()]);
  const [painelAnos, setPainelAnos] = useState(false);
  const [painelMeses, setPainelMeses] = useState(false);
  const [filtroLinha2, setFiltroLinha2] = useState<FiltroLinha2>('todas');
  const [catSelecionada, setCatSelecionada] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [transacaoEditar, setTransacaoEditar] = useState<Transacao | undefined>();
  const [transacaoDetalhe, setTransacaoDetalhe] = useState<Transacao | null>(null);
  const hoje = startOfTodayLocal();

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    transacoes.forEach((t) => anos.add(parseFinancialDate(t.data).getFullYear()));
    const lista = [...anos].sort();
    return lista.length > 0 ? lista : [new Date().getFullYear()];
  }, [transacoes]);

  const transacoesPorPeriodo = useMemo<TransacaoExibicao[]>(() => {
    // "Todos": retorna todas as transações sem filtro de data
    if (filtroAnos === 'todos') {
      return transacoes.flatMap((transacao) => {
        const cartao = transacao.cartao_id ? cartoes.find((c) => c.id === transacao.cartao_id) : undefined;
        const dataCompetencia = getDataCompetenciaDespesa(transacao, cartao);
        const dataExibicao = transacao.tipo === 'despesa' ? dataCompetencia : transacao.data;
        return [{ transacao, dataExibicao, dataOrdenacao: dataExibicao }];
      });
    }

    return transacoes.flatMap((transacao) => {
      const cartao = transacao.cartao_id ? cartoes.find((c) => c.id === transacao.cartao_id) : undefined;
      const dataCompetencia = getDataCompetenciaDespesa(transacao, cartao);
      const transacaoNaCompetencia = aplicarDataDeExibicaoNaTransacao(transacao, dataCompetencia);
      const results: TransacaoExibicao[] = [];

      for (const ano of filtroAnos) {
        for (const mes of filtroMeses) {
          // Cartão não-recorrente: aplica ciclo de faturamento
          if (transacao.tipo === 'despesa' && transacao.classificacao !== 'fixa' && (transacao.parcelas || 1) <= 1) {
            const [faturaAno, faturaMes] = dataCompetencia.split('-').map(Number);
            if (faturaMes === mes && faturaAno === ano) {
              results.push({ transacao, dataExibicao: dataCompetencia, dataOrdenacao: dataCompetencia });
            }
          } else {
            const ocorrencia = getDataOcorrenciaNoMes(
              transacao.tipo === 'despesa' ? transacaoNaCompetencia : transacao,
              mes,
              ano,
            );
            if (ocorrencia) {
              const dataExibicao = formatFinancialDate(ocorrencia);
              results.push({ transacao, dataExibicao, dataOrdenacao: dataExibicao });
            }
          }
        }
      }

      return results;
    });
  }, [transacoes, filtroMeses, filtroAnos, cartoes]);

  const chipsCategoria = useMemo(() => {
    const mapa: Record<string, { id: string; nome: string; icone: string; cor: string; total: number }> = {};
    transacoesPorPeriodo
      .filter(({ transacao }) => transacao.tipo === 'despesa')
      .forEach(({ transacao }) => {
        const cat = categorias.find((c) => c.id === transacao.categoria_id);
        const id = cat?.id || 'outros';
        const nome = cat?.nome || 'Outros';
        if (!mapa[id]) {
          mapa[id] = { id, nome, icone: cat?.icone || '$', cor: cat?.cor || '#6B7280', total: 0 };
        }
        mapa[id].total += transacao.valor;
      });
    return Object.values(mapa).sort((a, b) => b.total - a.total);
  }, [transacoesPorPeriodo, categorias]);

  const transacoesFiltradas = useMemo(() => {
    return transacoesPorPeriodo.filter(({ transacao }) => {
      const tipoOk = transacao.tipo === (visuTab === 'receitas' ? 'receita' : 'despesa');
      // ja_debitadas e previstas são aplicados em transacoesAgrupadas (precisam de realizadasIds)
      const classificacaoOk = visuTab === 'receitas'
        || filtroLinha2 === 'todas'
        || filtroLinha2 === 'ja_debitadas'
        || filtroLinha2 === 'previstas'
        || (filtroLinha2 === 'assinaturas' ? isTransacaoAssinatura(transacao) : getClassificacaoTransacao(transacao) === filtroLinha2);
      const buscaOk = !busca || transacao.descricao.toLowerCase().includes(busca.toLowerCase());
      const catOk = !catSelecionada || (() => {
        const cat = categorias.find((c) => c.id === transacao.categoria_id);
        return (cat?.id || 'outros') === catSelecionada;
      })();
      return tipoOk && classificacaoOk && buscaOk && catOk;
    });
  }, [transacoesPorPeriodo, visuTab, filtroLinha2, busca, catSelecionada, categorias]);

  const transacoesRealizadasFiltradas = useMemo(() => (
    transacoesFiltradas.filter(({ transacao, dataExibicao }) => {
      const transacaoNaCompetencia = aplicarDataDeExibicaoNaTransacao(transacao, dataExibicao);
      const data = parseFinancialDate(dataExibicao);
      const mesOcorrencia = data.getMonth() + 1;
      const anoOcorrencia = data.getFullYear();
      const fimDoMes = new Date(anoOcorrencia, mesOcorrencia, 0, 23, 59, 59, 999);
      const referencia = fimDoMes < hoje ? fimDoMes : hoje;
      return transacaoContaNoMesAteData(transacaoNaCompetencia, mesOcorrencia, anoOcorrencia, referencia);
    })
  ), [transacoesFiltradas, hoje]);

  const realizadasIds = useMemo(() => (
    new Set(
      transacoesRealizadasFiltradas.map(({ transacao, dataExibicao }) => `${transacao.id}|${dataExibicao}`),
    )
  ), [transacoesRealizadasFiltradas]);

  const totais = useMemo(() => {
    const despesasPrevistas = transacoesFiltradas
      .filter(({ transacao, dataExibicao }) => (
        transacao.tipo === 'despesa'
        && !transacao.cartao_id
        && !realizadasIds.has(`${transacao.id}|${dataExibicao}`)
      ))
      .reduce((soma, { transacao }) => soma + transacao.valor, 0);

    return {
      receitas: transacoesRealizadasFiltradas
        .filter(({ transacao }) => transacao.tipo === 'receita')
        .reduce((soma, { transacao }) => soma + transacao.valor, 0),
      despesas: transacoesRealizadasFiltradas
        .filter(({ transacao }) => transacao.tipo === 'despesa')
        .reduce((soma, { transacao }) => soma + transacao.valor, 0),
      despesasPrevistas,
    };
  }, [realizadasIds, transacoesRealizadasFiltradas, transacoesFiltradas]);

  const saldo = totais.receitas - totais.despesas;

  // Despesas já saídas do saldo bancário (PIX/débito/transferência, sem cartão)
  const debitadasSaldo = useMemo(() => {
    return transacoesFiltradas
      .filter(({ transacao, dataExibicao }) =>
        transacao.tipo === 'despesa' &&
        realizadasIds.has(`${transacao.id}|${dataExibicao}`) &&
        !transacao.cartao_id &&
        (!transacao.metodo_pagamento || METODOS_DEBITO.has(transacao.metodo_pagamento)),
      )
      .reduce((s, { transacao }) => s + transacao.valor, 0);
  }, [realizadasIds, transacoesFiltradas]);

  // Tudo que ainda precisa ser pago (cartão + contas futuras)
  const aPagar = totais.despesas + totais.despesasPrevistas - debitadasSaldo;

  const transacoesBaseExibidas = useMemo(() => {
    if (filtroLinha2 !== 'ja_debitadas' && filtroLinha2 !== 'previstas') {
      return transacoesFiltradas;
    }

    return transacoesFiltradas.filter(({ transacao, dataExibicao }) => {
      const realizada = realizadasIds.has(`${transacao.id}|${dataExibicao}`);
      if (filtroLinha2 === 'ja_debitadas') {
        const naoCartao = !transacao.cartao_id;
        const metodoOk = !transacao.metodo_pagamento || METODOS_DEBITO.has(transacao.metodo_pagamento);
        return realizada && naoCartao && metodoOk;
      }
      return !transacao.cartao_id && !realizada;
    });
  }, [filtroLinha2, realizadasIds, transacoesFiltradas]);

  const resumoFiltroDespesas = useMemo(() => {
    const base = transacoesBaseExibidas.filter(({ transacao }) => transacao.tipo === 'despesa');
    const total = base.reduce((soma, { transacao }) => soma + transacao.valor, 0);
    const debitadas = base
      .filter(({ transacao, dataExibicao }) => (
        realizadasIds.has(`${transacao.id}|${dataExibicao}`)
        && !transacao.cartao_id
        && (!transacao.metodo_pagamento || METODOS_DEBITO.has(transacao.metodo_pagamento))
      ))
      .reduce((soma, { transacao }) => soma + transacao.valor, 0);

    return {
      total,
      debitadas,
      aPagar: Math.max(total - debitadas, 0),
    };
  }, [realizadasIds, transacoesBaseExibidas]);

  const transacoesAgrupadas = useMemo(() => {
    const grupos: Record<string, TransacaoExibicao[]> = {};
    const base = transacoesBaseExibidas;
    const ordenadas = [...base].sort((a, b) => b.dataOrdenacao.localeCompare(a.dataOrdenacao));
    ordenadas.forEach((item) => {
      if (!grupos[item.dataExibicao]) grupos[item.dataExibicao] = [];
      grupos[item.dataExibicao].push(item);
    });
    return Object.entries(grupos).sort(([a], [b]) => b.localeCompare(a));
  }, [transacoesBaseExibidas]);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Transações</h2>
        <button
          onClick={() => { setTransacaoEditar(undefined); setModalAberto(true); }}
          className="btn-primary flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} /> Novo
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-white/5 rounded-2xl p-1 w-fit">
        <button
          onClick={() => { setVisuTab('despesas'); setCatSelecionada(null); }}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            visuTab === 'despesas' ? 'bg-red-500/20 text-red-300 shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Despesas
        </button>
        <button
          onClick={() => { setVisuTab('receitas'); setCatSelecionada(null); setFiltroLinha2('todas'); }}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            visuTab === 'receitas' ? 'bg-emerald-500/20 text-emerald-300 shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Receitas
        </button>
      </div>

      {/* Filtro por período */}
      <div className="flex gap-2">
        {(painelAnos || painelMeses) && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => { setPainelAnos(false); setPainelMeses(false); }}
          />
        )}

        {/* Botão Ano */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setPainelAnos((v) => !v); setPainelMeses(false); }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 transition-colors"
          >
            {filtroAnos === 'todos'
              ? 'Todos os anos'
              : filtroAnos.length === 1
              ? String(filtroAnos[0])
              : filtroAnos.join(' · ')}
            <ChevronDown size={12} className={`transition-transform ${painelAnos ? 'rotate-180' : ''}`} />
          </button>
          {painelAnos && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
              <button
                type="button"
                onClick={() => { setFiltroAnos('todos'); setPainelAnos(false); }}
                className={`w-full rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                  filtroAnos === 'todos' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                Todos
              </button>
              {anosDisponiveis.map((ano) => {
                const ativo = filtroAnos !== 'todos' && filtroAnos.includes(ano);
                return (
                  <button
                    key={ano}
                    type="button"
                    onClick={() =>
                      setFiltroAnos((prev) => {
                        if (prev === 'todos') return [ano];
                        if (prev.includes(ano)) return prev.length > 1 ? prev.filter((a) => a !== ano) : prev;
                        return [...prev, ano];
                      })
                    }
                    className={`w-full rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                      ativo ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {ano}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Botão Mês (oculto quando "Todos os anos") */}
        {filtroAnos !== 'todos' && (
          <div className="relative">
            <button
              type="button"
              onClick={() => { setPainelMeses((v) => !v); setPainelAnos(false); }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 transition-colors"
            >
              {filtroMeses.length === 1
                ? nomesMeses[filtroMeses[0] - 1]
                : filtroMeses.length <= 3
                ? filtroMeses.map((m) => nomesMeses[m - 1]).join(' · ')
                : `${filtroMeses.length} meses`}
              <ChevronDown size={12} className={`transition-transform ${painelMeses ? 'rotate-180' : ''}`} />
            </button>
            {painelMeses && (
              <div className="absolute left-0 top-full mt-1 z-50 rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
                <div className="grid grid-cols-3 gap-1">
                  {nomesMeses.map((nome, i) => {
                    const mes = i + 1;
                    const ativo = filtroMeses.includes(mes);
                    return (
                      <button
                        key={nome}
                        type="button"
                        onClick={() =>
                          setFiltroMeses((prev) =>
                            prev.includes(mes)
                              ? prev.length > 1 ? prev.filter((m) => m !== mes) : prev
                              : [...prev, mes],
                          )
                        }
                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                          ativo ? 'bg-slate-600 text-white' : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        {nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DESPESAS TAB ─────────────────────────────────── */}
      {visuTab === 'despesas' && (
        <>
          {/* Summary */}
          <div className="space-y-2">
            <div className="rounded-2xl border border-red-800/30 bg-red-950/20 p-4">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{LABEL_FILTRO_DESPESA[filtroLinha2]}</div>
              <div className="text-2xl font-bold tabular-nums text-white mb-3">
                {formatarMoeda(resumoFiltroDespesas.total)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Debitadas do saldo</div>
                  <div className="text-base font-bold tabular-nums text-red-400">{formatarMoeda(resumoFiltroDespesas.debitadas)}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">PIX, boleto, débito</div>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-amber-500 mb-1">A pagar</div>
                  <div className="text-base font-bold tabular-nums text-amber-400">{formatarMoeda(resumoFiltroDespesas.aPagar)}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">Cartão, contas, etc.</div>
                </div>
              </div>
              {resumoFiltroDespesas.total > 0 && resumoFiltroDespesas.aPagar > 0 && (
                <div className="mt-3">
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500/60 rounded-full"
                      style={{ width: `${Math.min((resumoFiltroDespesas.debitadas / resumoFiltroDespesas.total) * 100, 100)}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                    <span>debitado do saldo</span>
                    <span>a pagar</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <TimelineGastos transacoes={transacoes} categorias={categorias} cartoes={cartoes} />

          {/* Category chips */}
          {chipsCategoria.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button onClick={() => setCatSelecionada(null)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  catSelecionada === null ? 'bg-purple-600 text-white' : 'border border-white/10 bg-white/5 text-slate-400 hover:text-white'
                }`}>
                Todos
              </button>
              {chipsCategoria.map((cat) => (
                <button key={cat.id} onClick={() => setCatSelecionada(catSelecionada === cat.id ? null : cat.id)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    catSelecionada === cat.id ? 'text-white shadow-lg' : 'border border-white/10 bg-white/5 text-slate-400 hover:text-white'
                  }`}
                  style={catSelecionada === cat.id ? { background: cat.cor } : {}}>
                  <span>{cat.icone}</span><span>{cat.nome}</span>
                  <span className="opacity-70">{formatarMoeda(cat.total)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" placeholder="Buscar por descrição..."
                value={busca} onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-purple-500" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {FILTROS_LINHA2.map((f) => (
                <button key={f.valor} onClick={() => setFiltroLinha2(f.valor)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    filtroLinha2 === f.valor
                      ? f.valor === 'ja_debitadas' ? 'bg-emerald-700 text-white'
                        : f.valor === 'previstas' ? 'bg-amber-700 text-white'
                        : 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              "Fixas" são recorrentes. "Já debitadas" mostra PIX, débito e transferências realizados. "Previstas" mostra o que ainda não foi pago.
            </p>
          </div>
        </>
      )}

      {/* ── RECEITAS TAB ─────────────────────────────────── */}
      {visuTab === 'receitas' && (
        <>
          {/* Summary */}
          <div className="rounded-2xl border border-emerald-800/30 bg-emerald-950/20 p-4">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Total recebido no mês</div>
            <div className="text-2xl font-bold tabular-nums text-emerald-400 mb-3">
              +{formatarMoeda(totais.receitas)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wide text-emerald-500 mb-1">Realizadas</div>
                <div className="text-base font-bold tabular-nums text-emerald-400">{formatarMoeda(totais.receitas)}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">já recebidas</div>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Agendadas</div>
                <div className="text-base font-bold tabular-nums text-slate-300">
                  +{formatarMoeda(totais.despesasPrevistas > 0 ? 0 : 0)}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">receitas fixas futuras</div>
              </div>
            </div>
          </div>

          <TimelineReceitas transacoes={transacoes} categorias={categorias} />

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Buscar por descrição..."
              value={busca} onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-emerald-500" />
          </div>
        </>
      )}

      <div className="space-y-4">
        {transacoesAgrupadas.length === 0 ? (
          <div className="py-12 text-center text-slate-600">
            <div className="mb-3 text-4xl">?</div>
            <p className="text-sm">Nenhuma transacao encontrada</p>
          </div>
        ) : (
          transacoesAgrupadas.map(([data, grupo]) => {
            const totalDia = grupo.reduce((soma, { transacao }) => (
              transacao.tipo === 'receita' ? soma + transacao.valor : soma - transacao.valor
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
                  {grupo.map(({ transacao: t, dataExibicao }) => {
                    const cat = categorias.find((c) => c.id === t.categoria_id);
                    const conta = contas.find((item) => item.id === t.conta_id);
                    const cartao = cartoes.find((item) => item.id === t.cartao_id);
                    const badgeClassificacao = getBadgeClassificacao(t, hoje, dataExibicao);
                    const eFutura = parseFinancialDate(dataExibicao) > hoje;
                    const parcelamento = calcularParcelamentoInfo(t, parseFinancialDate(dataExibicao));

                    return (
                      <button
                        key={`${t.id}-${dataExibicao}`}
                        type="button"
                        onClick={() => setTransacaoDetalhe(t)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 text-left"
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                          style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)' }}
                        >
                          {cat?.icone || '$'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-white">{t.descricao}</div>
                          <div className="text-xs text-slate-500">
                            {cat?.nome || 'Outros'}
                            {t.metodo_pagamento && ` • ${t.metodo_pagamento.toUpperCase()}`}
                            {t.parcelas && t.parcelas > 1 && ` • ${parcelamento?.parcelaAtual || 0}/${t.parcelas}x`}
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
                              {t.cartao_id ? 'Cobranca em ' : 'Prevista para '}{parseFinancialDate(dataExibicao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
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
                        <div className="flex shrink-0 items-center gap-2">
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
