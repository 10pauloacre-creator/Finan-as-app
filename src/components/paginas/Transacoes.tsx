'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Edit, Plus, Search, Trash2, X } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { ContaBancaria, CartaoCredito, Transacao } from '@/types';
import ModalNovaTransacao from '@/components/modais/ModalNovaTransacao';
import { formatFinancialDate, parseFinancialDate, startOfTodayLocal } from '@/lib/date';
import {
  calcularDataFinalParcelamento,
  calcularGastoRecorrenteAnual,
  calcularParcelamentoInfo,
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

type DadosMesGastos = {
  mes: string;
  label: string;
  ano: string;
  total: number;
  tipo: 'passado' | 'atual' | 'futuro';
  por_categoria: { id: string; nome: string; icone: string; cor: string; valor: number }[];
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

function calcularTimelineGastos(
  transacoes: import('@/types').Transacao[],
  categorias: import('@/types').Categoria[],
): DadosMesGastos[] {
  const hoje = tgMesAtual();

  // Sempre vai até dezembro de 2027
  const [hojeY, hojeM] = hoje.split('-').map(Number);
  const maxFuturo = Math.max((2027 - hojeY) * 12 + (12 - hojeM), 2);

  const todosMeses: string[] = [];
  for (let i = 0; i <= maxFuturo; i++) todosMeses.push(tgAddMeses(hoje, i));

  return todosMeses.map((mes) => {
    const [year, month] = mes.split('-').map(Number);
    const tipo: DadosMesGastos['tipo'] = mes < hoje ? 'passado' : mes === hoje ? 'atual' : 'futuro';
    const catMap: Record<string, number> = {};

    if (tipo !== 'futuro') {
      // Passado e atual: soma transações com data no mês
      transacoes.forEach((tx) => {
        if (tx.tipo !== 'despesa' || !tx.data.startsWith(mes)) return;
        catMap[tx.categoria_id] = (catMap[tx.categoria_id] || 0) + tx.valor;
      });
    } else {
      // Futuro: transações já agendadas para o mês
      transacoes.forEach((tx) => {
        if (tx.tipo !== 'despesa' || !tx.data.startsWith(mes)) return;
        catMap[tx.categoria_id] = (catMap[tx.categoria_id] || 0) + tx.valor;
      });
      // + parcelas projetadas de meses anteriores (sem dupla contagem)
      transacoes.forEach((tx) => {
        if (tx.tipo !== 'despesa' || !tx.parcelas || tx.parcelas <= 1) return;
        if (tx.data.startsWith(mes)) return; // já contado acima
        const parcelaAtual = tx.parcela_atual || 1;
        const primeiroMes = tgAddMeses(tx.data.substring(0, 7), 1 - parcelaAtual);
        const ultimoMes = tgAddMeses(primeiroMes, tx.parcelas - 1);
        if (mes >= primeiroMes && mes <= ultimoMes) {
          catMap[tx.categoria_id] = (catMap[tx.categoria_id] || 0) + tx.valor;
        }
      });
    }

    const por_categoria = Object.entries(catMap)
      .map(([catId, valor]) => {
        const cat = categorias.find((c) => c.id === catId);
        return {
          id: catId,
          nome: cat?.nome || 'Outros',
          icone: cat?.icone || '$',
          cor: cat?.cor || '#6B7280',
          valor,
        };
      })
      .sort((a, b) => b.valor - a.valor);

    return {
      mes,
      label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][month - 1],
      ano: String(year),
      total: por_categoria.reduce((s, c) => s + c.valor, 0),
      tipo,
      por_categoria,
    };
  });
}

function TimelineGastos({
  transacoes,
  categorias,
}: {
  transacoes: import('@/types').Transacao[];
  categorias: import('@/types').Categoria[];
}) {
  const dados = useMemo(() => calcularTimelineGastos(transacoes, categorias), [transacoes, categorias]);
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
            <defs>
              <linearGradient id="tgFillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#EF4444" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#EF4444" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {atualIdx >= 0 && (
              <path
                d={`M ${atualIdx * TG_CARD_STEP} ${TG_CARD_H} L ${atualIdx * TG_CARD_STEP} ${points[atualIdx].y} L ${atualIdx * TG_CARD_STEP + TG_CARD_W} ${points[atualIdx].y} L ${atualIdx * TG_CARD_STEP + TG_CARD_W} ${TG_CARD_H} Z`}
                fill="url(#tgFillGrad)"
              />
            )}

            <path d={pastPath} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />

            {futurePath && (
              <path d={futurePath} fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 4" />
            )}

            {points.map((pt, i) => {
              const d = dados[i];
              const isAtual = d.tipo === 'atual';
              const isPast = d.tipo === 'passado';
              return (
                <g key={d.mes}>
                  {isAtual && <circle cx={pt.x} cy={pt.y} r={12} fill="#EF4444" fillOpacity="0.12" />}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isAtual ? 6 : 5}
                    fill={isPast ? '#10B981' : isAtual ? 'white' : 'transparent'}
                    stroke={isPast ? '#10B981' : isAtual ? '#EF4444' : '#6B7280'}
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
              <button
                key={d.mes}
                type="button"
                onClick={() => setMesSelecionado((prev) => (prev === d.mes ? null : d.mes))}
                className={`absolute flex flex-col items-center justify-end pb-4 rounded-2xl transition-all ${
                  isAtual
                    ? 'border-2 border-red-500/50 bg-red-500/5'
                    : isSel
                      ? 'border border-purple-500/40 bg-white/4'
                      : 'border border-white/5 bg-white/2 hover:bg-white/5'
                }`}
                style={{ left: i * TG_CARD_STEP, top: 0, width: TG_CARD_W, height: TG_CARD_H, zIndex: 1 }}
              >
                <div className={`text-xs font-semibold mb-1 ${isAtual ? 'text-red-400' : isFuturo ? 'text-slate-500' : 'text-slate-400'}`}>
                  {d.label}
                </div>
                <div className={`text-sm font-bold tabular-nums ${isAtual ? 'text-red-300' : isFuturo ? 'text-slate-500' : 'text-white'}`}>
                  {formatarMoeda(d.total)}
                </div>
                {isFuturo && d.total > 0 && (
                  <div className="text-[10px] text-slate-600 mt-0.5">estimado</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {mesSel && mesSel.por_categoria.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="text-xs text-slate-500 mb-3">
            {mesSel.label} {mesSel.ano}
            {mesSel.tipo === 'futuro' && ' — projeção de parcelas'}
            {mesSel.tipo === 'passado' && ' — despesas do mês'}
            {mesSel.tipo === 'atual' && ' — despesas até agora'}
          </div>
          <div className="space-y-2">
            {mesSel.por_categoria.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                  style={{ background: `${c.cor}22` }}
                >
                  {c.icone}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-300 truncate">{c.nome}</span>
                    <span className="text-xs font-semibold text-white tabular-nums shrink-0">
                      {formatarMoeda(c.valor)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(c.valor / mesSel.total) * 100}%`,
                        background: c.cor,
                        opacity: 0.7,
                      }}
                    />
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

type PeriodoFiltro = 'mes' | '3meses' | 'tudo';
type FiltroLinha2 = 'todas' | 'padrao' | 'fixa' | 'ja_debitadas' | 'previstas';
type TransacaoExibicao = {
  transacao: Transacao;
  dataExibicao: string;
  dataOrdenacao: string;
};

const FILTROS_LINHA2: { valor: FiltroLinha2; label: string }[] = [
  { valor: 'todas',        label: 'Todas' },
  { valor: 'padrao',       label: 'Normais' },
  { valor: 'fixa',         label: 'Fixas' },
  { valor: 'ja_debitadas', label: '✓ Já debitadas' },
  { valor: 'previstas',    label: '⏱ Previstas' },
];

const METODOS_DEBITO = new Set(['pix', 'debito', 'transferencia', 'dinheiro', 'emprestimo', 'financiamento']);

function getClassificacaoTransacao(transacao: Transacao): 'padrao' | 'fixa' | 'futura' {
  return transacao.classificacao || 'padrao';
}

function getBadgeClassificacao(transacao: Transacao, hoje: Date, dataExibicao?: string) {
  if (transacao.cartao_id && transacao.tipo === 'despesa') {
    const referencia = parseFinancialDate(dataExibicao || transacao.data);
    const prevista = referencia > hoje;
    return {
      label: prevista ? 'Cartao previsto' : 'Cartao ja cobrado',
      className: prevista
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/20'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    };
  }

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
  const ehReceita = transacao.tipo === 'receita';
  const dataCobrancaCartao = transacao.cartao_id ? getDataCobrancaCartao(transacao, cartao) : null;
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
              className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-2 text-purple-300 hover:bg-purple-500/20"
              title="Editar"
            >
              <Edit size={14} />
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
              <div className="mt-1 text-sm font-semibold text-red-400 tabular-nums">
                {formatarMoeda(parcelamento?.valorTotal ?? transacao.valor)}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">{transacao.cartao_id ? 'Data da compra' : 'Data'}</div>
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
              {dataCobrancaCartao && (
                <>
                  <div className="mt-3 text-[11px] text-slate-500">Cobranca no cartao</div>
                  <div className="mt-1 text-sm text-amber-300">{parseFinancialDate(dataCobrancaCartao).toLocaleDateString('pt-BR')}</div>
                </>
              )}
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
                  <div className="text-[11px] text-slate-500">{ehReceita ? 'Ja recebido' : 'Ja pago'}</div>
                  <div className="mt-1 text-sm font-semibold text-white">{parcelamento.parcelasLiquidadasAntes}/{parcelamento.totalParcelas}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">{ehReceita ? 'Faltam receber' : 'Faltam pagar'}</div>
                  <div className="mt-1 text-sm font-semibold text-amber-300">{parcelamento.parcelasRestantes}x</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Valor da parcela</div>
                  <div className="mt-1 text-sm font-semibold text-white tabular-nums">{formatarMoeda(parcelamento.valorParcela)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">{ehReceita ? 'Valor a receber' : 'Valor restante'}</div>
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
                Parcela atual em aberto: {Math.min(parcelamento.parcelasLiquidadasAntes + 1, parcelamento.totalParcelas)}/{parcelamento.totalParcelas}. Valor total planejado: {formatarMoeda(parcelamento.valorTotal)}.
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
  const [filtroLinha2, setFiltroLinha2] = useState<FiltroLinha2>('todas');
  const [catSelecionada, setCatSelecionada] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [transacaoEditar, setTransacaoEditar] = useState<Transacao | undefined>();
  const [transacaoDetalhe, setTransacaoDetalhe] = useState<Transacao | null>(null);
  const hoje = startOfTodayLocal();

  const transacoesPorPeriodo = useMemo<TransacaoExibicao[]>(() => {
    const agora = new Date();
    return transacoes.flatMap((transacao) => {
      const cartao = transacao.cartao_id ? cartoes.find((c) => c.id === transacao.cartao_id) : undefined;
      const dataCobrancaCartao = transacao.cartao_id ? getDataCobrancaCartao(transacao, cartao) : transacao.data;

      if (periodo === 'mes') {
        // Cartão não-recorrente: aplica ciclo de faturamento
        if (transacao.cartao_id && transacao.classificacao !== 'fixa') {
          const [faturaAno, faturaMes] = dataCobrancaCartao.split('-').map(Number);
          return faturaMes === filtroMes && faturaAno === filtroAno
            ? [{ transacao, dataExibicao: dataCobrancaCartao, dataOrdenacao: transacao.data }]
            : [];
        }
        // Demais (débito, pix, recorrentes): lógica padrão
        const ocorrencia = getDataOcorrenciaNoMes(transacao, filtroMes, filtroAno);
        return ocorrencia
          ? [{ transacao, dataExibicao: formatFinancialDate(ocorrencia), dataOrdenacao: formatFinancialDate(ocorrencia) }]
          : [];
      }
      if (periodo === '3meses') {
        const tresMesesAtras = new Date(agora);
        tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 2);
        tresMesesAtras.setDate(1);
        return parseFinancialDate(dataCobrancaCartao) >= tresMesesAtras
          ? [{ transacao, dataExibicao: dataCobrancaCartao, dataOrdenacao: transacao.data }]
          : [];
      }
      return [{ transacao, dataExibicao: dataCobrancaCartao, dataOrdenacao: transacao.data }];
    });
  }, [transacoes, periodo, filtroMes, filtroAno, cartoes]);

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
      const tipoOk = filtroTipo === 'todos' || transacao.tipo === filtroTipo;
      // ja_debitadas e previstas são aplicados em transacoesAgrupadas (precisam de realizadasIds)
      const classificacaoOk = (filtroLinha2 !== 'padrao' && filtroLinha2 !== 'fixa')
        || getClassificacaoTransacao(transacao) === filtroLinha2;
      const buscaOk = !busca || transacao.descricao.toLowerCase().includes(busca.toLowerCase());
      const catOk = !catSelecionada || (() => {
        const cat = categorias.find((c) => c.id === transacao.categoria_id);
        return (cat?.id || 'outros') === catSelecionada;
      })();
      return tipoOk && classificacaoOk && buscaOk && catOk;
    });
  }, [transacoesPorPeriodo, filtroTipo, filtroLinha2, busca, catSelecionada, categorias]);

  const referenciaTotais = useMemo(() => {
    if (periodo !== 'mes') return hoje;
    const referenciaSelecionada = new Date(filtroAno, filtroMes - 1, 1);
    const comparacaoAno = referenciaSelecionada.getFullYear() - hoje.getFullYear();
    const comparacaoMes = comparacaoAno === 0 ? referenciaSelecionada.getMonth() - hoje.getMonth() : comparacaoAno;

    if (comparacaoMes < 0) {
      return new Date(filtroAno, filtroMes, 0, 23, 59, 59, 999);
    }

    if (comparacaoMes > 0) {
      return new Date(filtroAno, filtroMes, 0, 23, 59, 59, 999);
    }

    return hoje;
  }, [periodo, filtroAno, filtroMes, hoje]);

  const transacoesRealizadasFiltradas = useMemo(() => (
    transacoesFiltradas.filter(({ transacao, dataExibicao }) => {
      if (periodo === 'mes') {
        const data = parseFinancialDate(dataExibicao);
        return transacaoContaNoMesAteData(transacao, data.getMonth() + 1, data.getFullYear(), referenciaTotais);
      }
      return transacaoJaOcorreuAteData(transacao, referenciaTotais);
    })
  ), [transacoesFiltradas, periodo, referenciaTotais]);

  const totais = useMemo(() => {
    const realizadasIds = new Set(
      transacoesRealizadasFiltradas.map(({ transacao, dataExibicao }) => `${transacao.id}|${dataExibicao}`),
    );
    const despesasPrevistas = transacoesFiltradas
      .filter(({ transacao, dataExibicao }) => (
        transacao.tipo === 'despesa'
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
  }, [transacoesRealizadasFiltradas, transacoesFiltradas]);

  const saldo = totais.receitas - totais.despesas;

  const transacoesAgrupadas = useMemo(() => {
    const realizadasIds = new Set(
      transacoesRealizadasFiltradas.map(({ transacao, dataExibicao }) => `${transacao.id}|${dataExibicao}`),
    );
    const grupos: Record<string, TransacaoExibicao[]> = {};
    const base = (filtroLinha2 === 'ja_debitadas' || filtroLinha2 === 'previstas')
      ? transacoesFiltradas.filter(({ transacao, dataExibicao }) => {
          const realizada = realizadasIds.has(`${transacao.id}|${dataExibicao}`);
          if (filtroLinha2 === 'ja_debitadas') {
            const naoCartao = !transacao.cartao_id;
            const metodoOk = !transacao.metodo_pagamento
              || METODOS_DEBITO.has(transacao.metodo_pagamento);
            return realizada && naoCartao && metodoOk;
          }
          return !realizada;
        })
      : transacoesFiltradas;
    const ordenadas = [...base].sort((a, b) => b.dataOrdenacao.localeCompare(a.dataOrdenacao));
    ordenadas.forEach((item) => {
      if (!grupos[item.dataExibicao]) grupos[item.dataExibicao] = [];
      grupos[item.dataExibicao].push(item);
    });
    return Object.entries(grupos).sort(([a], [b]) => b.localeCompare(a));
  }, [transacoesFiltradas, transacoesRealizadasFiltradas, filtroLinha2]);

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

      <div className="space-y-2">
        {/* Linha 1: Receitas e Saldo */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/30 p-3 text-center">
            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-emerald-400">Receitas</div>
            <div className="text-base font-bold tabular-nums text-emerald-400">{formatarMoeda(totais.receitas)}</div>
          </div>
          <div className={`rounded-2xl border p-3 text-center ${saldo >= 0 ? 'border-blue-800/40 bg-blue-950/30' : 'border-orange-800/40 bg-orange-950/30'}`}>
            <div className={`mb-0.5 text-[10px] uppercase tracking-wide ${saldo >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>Saldo</div>
            <div className={`text-base font-bold tabular-nums ${saldo >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
              {saldo >= 0 ? '+' : ''}{formatarMoeda(saldo)}
            </div>
          </div>
        </div>

        {/* Linha 2: Despesas detalhadas */}
        <div className="rounded-2xl border border-red-800/40 bg-red-950/30 p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Já debitadas</div>
              <div className="text-sm font-bold tabular-nums text-red-400">{formatarMoeda(totais.despesas)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-amber-500 mb-0.5">Previstas</div>
              <div className="text-sm font-bold tabular-nums text-amber-400">{formatarMoeda(totais.despesasPrevistas)}</div>
            </div>
            <div className="border-l border-red-800/40 pl-2">
              <div className="text-[10px] uppercase tracking-wide text-red-300 mb-0.5">Total do mês</div>
              <div className="text-sm font-bold tabular-nums text-white">{formatarMoeda(totais.despesas + totais.despesasPrevistas)}</div>
            </div>
          </div>
          {totais.despesasPrevistas > 0 && (
            <div className="mt-2.5 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500/60 rounded-full"
                style={{ width: `${Math.min((totais.despesas / (totais.despesas + totais.despesasPrevistas)) * 100, 100)}%` }}
              />
            </div>
          )}
          {totais.despesasPrevistas > 0 && (
            <div className="mt-1 flex justify-between text-[10px] text-slate-600">
              <span>debitado</span>
              <span>previsto</span>
            </div>
          )}
        </div>
      </div>

      <TimelineGastos transacoes={transacoes} categorias={categorias} />

      {chipsCategoria.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCatSelecionada(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
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
              className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
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
          {FILTROS_LINHA2.map((f) => (
            <button
              key={f.valor}
              onClick={() => setFiltroLinha2(f.valor)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filtroLinha2 === f.valor
                  ? f.valor === 'ja_debitadas'
                    ? 'bg-emerald-700 text-white'
                    : f.valor === 'previstas'
                      ? 'bg-amber-700 text-white'
                      : 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          "Fixas" são recorrentes. "Já debitadas" mostra apenas pagamentos via PIX, débito ou transferência já realizados. "Previstas" mostra o que ainda não foi pago.
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
