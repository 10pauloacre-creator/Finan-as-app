'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, Pencil, CreditCard, Check, X, AlertCircle, Brain, Loader2, ChevronDown,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { BANCO_INFO, BancoSlug, BandeirCartao, CartaoCredito, Categoria, Transacao } from '@/types';
import type { TransacaoExtraida } from '@/lib/assistente-types';
import { parseFinancialDate, formatFinancialDate, startOfTodayLocal } from '@/lib/date';
import {
  getDataCobrancaCartaoParaData,
  getDataOcorrenciaNoMes,
  getStatusPagamentoOcorrencia,
} from '@/lib/transacoes';
import {
  existeValorNaFaturaDoMes,
  getDataCobrancaPorReferencia,
  getChaveFaturaMes,
  getDescricaoPeriodoReferencia,
  solicitarPeriodoReferenciaCartao,
} from '@/lib/importacao-cartao';
import BankLogo from '@/components/ui/BankLogo';
import BankSelector from '@/components/ui/BankSelector';
import CardBrandLogo from '@/components/ui/CardBrandLogo';
import ModalNovaTransacao from '@/components/modais/ModalNovaTransacao';
import ModalDetalheTransacao from '@/components/modais/ModalDetalheTransacao';

const BANDEIRAS: BandeirCartao[] = ['visa', 'mastercard', 'elo', 'amex', 'hipercard'];

// ─── Timeline de Faturas ─────────────────────────────────────────────────────
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const TL_CARD_W = 140;
const TL_CARD_GAP = 12;
const TL_CARD_STEP = TL_CARD_W + TL_CARD_GAP;
const TL_CARD_H = 178;
const TL_DOT_TOP = 22;
const TL_DOT_BOT = 110;

type DadosMes = {
  mes: string;
  label: string;
  ano: string;
  total: number;
  total_previsto: number;
  total_debitado: number;
  tipo: 'passado' | 'atual' | 'futuro';
  por_cartao: { id: string; nome: string; banco: BancoSlug; valor: number }[];
};

function tlAddMeses(mesKey: string, n: number): string {
  const [y, m] = mesKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function tlMesAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function tlDotY(valor: number, maxValor: number): number {
  if (maxValor === 0) return (TL_DOT_TOP + TL_DOT_BOT) / 2;
  const norm = Math.min(valor / maxValor, 1);
  return TL_DOT_BOT - norm * (TL_DOT_BOT - TL_DOT_TOP);
}

function tlBuildPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x} ${pts[0].y}` : '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + TL_CARD_STEP * 0.4;
    const cp2x = pts[i].x - TL_CARD_STEP * 0.4;
    d += ` C ${cp1x} ${pts[i - 1].y}, ${cp2x} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

function calcularTimelineMeses(cartoes: CartaoCredito[], transacoes: Transacao[]): DadosMes[] {
  const hoje = tlMesAtual();
  const referenciaHoje = new Date();
  const maxFuturo = 5;

  const todosMeses: string[] = [];
  for (let i = -3; i <= maxFuturo; i++) todosMeses.push(tlAddMeses(hoje, i));

  return todosMeses.map((mes) => {
    const [year, month] = mes.split('-').map(Number);
    const tipo: DadosMes['tipo'] = mes < hoje ? 'passado' : mes === hoje ? 'atual' : 'futuro';
    let totalPrevisto = 0;
    let totalDebitado = 0;

    const por_cartao = cartoes.map((cartao) => {
      const valor = transacoes.reduce((soma, tx) => {
        if (tx.cartao_id !== cartao.id) return soma;
        const txNaCompetencia = tx.data_cobranca ? { ...tx, data: tx.data_cobranca } : tx;
        const ocorrencia = getDataOcorrenciaNoMes(txNaCompetencia, month, year);
        if (!ocorrencia) return soma;
        const dataCobranca = tx.data_cobranca
          ? formatFinancialDate(ocorrencia)
          : getDataCobrancaCartaoParaData(formatFinancialDate(ocorrencia), cartao);
        const dataCobrancaDate = parseFinancialDate(dataCobranca);
        if (dataCobrancaDate.getMonth() + 1 !== month || dataCobrancaDate.getFullYear() !== year) return soma;
        const delta = tx.tipo === 'despesa' ? tx.valor : -tx.valor;
        if (dataCobrancaDate > referenciaHoje) {
          totalPrevisto += delta;
        } else {
          totalDebitado += delta;
        }
        return soma + delta;
      }, 0);
      return { id: cartao.id, nome: cartao.nome, banco: cartao.banco, valor: Math.max(0, valor) };
    });

    return {
      mes,
      label: MESES_PT[month - 1],
      ano: String(year),
      total: Math.max(0, por_cartao.reduce((s, c) => s + c.valor, 0)),
      total_previsto: Math.max(0, totalPrevisto),
      total_debitado: Math.max(0, totalDebitado),
      tipo,
      por_cartao,
    };
  });
}

function TimelineFaturas({ cartoes, transacoes }: { cartoes: CartaoCredito[]; transacoes: Transacao[] }) {
  const dados = useMemo(() => calcularTimelineMeses(cartoes, transacoes), [cartoes, transacoes]);
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const atualIdx = dados.findIndex((d) => d.tipo === 'atual');
    if (atualIdx < 0) return;
    const containerW = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = Math.max(0, atualIdx * TL_CARD_STEP - containerW / 2 + TL_CARD_W / 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cartoes.length === 0) return null;

  const maxValor = Math.max(...dados.map((d) => d.total), 1);
  const totalW = dados.length * TL_CARD_STEP - TL_CARD_GAP;
  const atualIdx = dados.findIndex((d) => d.tipo === 'atual');

  const points = dados.map((d, i) => ({
    x: i * TL_CARD_STEP + TL_CARD_W / 2,
    y: tlDotY(d.total, maxValor),
  }));

  const pastPath = tlBuildPath(points.slice(0, atualIdx + 1));
  const futurePath = atualIdx >= 0 ? tlBuildPath(points.slice(atualIdx)) : '';

  const mesSel = mesSelecionado ? dados.find((d) => d.mes === mesSelecionado) : null;

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-1">Estimativa de Gastos dos Próximos Meses</h3>
      <p className="text-[11px] text-slate-600 mb-4">Inclui já debitadas, ativas, recorrentes, futuras e parceladas de todos os cartões</p>

      <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1" style={{ scrollBehavior: 'smooth' }}>
        <div className="relative" style={{ width: totalW, height: TL_CARD_H }}>
          {/* SVG sparkline overlay */}
          <svg
            width={totalW}
            height={TL_CARD_H}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 2 }}
          >
            <defs>
              <linearGradient id="tlFillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Gradient fill under current month */}
            {atualIdx >= 0 && (
              <path
                d={`M ${atualIdx * TL_CARD_STEP} ${TL_CARD_H} L ${atualIdx * TL_CARD_STEP} ${points[atualIdx].y} L ${atualIdx * TL_CARD_STEP + TL_CARD_W} ${points[atualIdx].y} L ${atualIdx * TL_CARD_STEP + TL_CARD_W} ${TL_CARD_H} Z`}
                fill="url(#tlFillGrad)"
              />
            )}

            {/* Past + current solid line */}
            <path d={pastPath} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />

            {/* Future dashed line */}
            {futurePath && (
              <path d={futurePath} fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 4" />
            )}

            {/* Dots */}
            {points.map((pt, i) => {
              const d = dados[i];
              const isAtual = d.tipo === 'atual';
              const isFuturo = d.tipo === 'futuro';
              const isPast = d.tipo === 'passado';
              return (
                <g key={d.mes}>
                  {isAtual && <circle cx={pt.x} cy={pt.y} r={12} fill="#3B82F6" fillOpacity="0.12" />}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isAtual ? 6 : 5}
                    fill={isPast ? '#10B981' : isAtual ? 'white' : 'transparent'}
                    stroke={isPast ? '#10B981' : isAtual ? '#3B82F6' : '#6B7280'}
                    strokeWidth={isAtual ? 2.5 : 1.5}
                  />
                </g>
              );
            })}
          </svg>

          {/* Month cards */}
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
                    ? 'border-2 border-blue-500/60 bg-blue-500/5'
                    : isSel
                      ? 'border border-purple-500/40 bg-white/[0.04]'
                      : 'border border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
                style={{ left: i * TL_CARD_STEP, top: 0, width: TL_CARD_W, height: TL_CARD_H, zIndex: 1 }}
              >
                <div className={`text-xs font-semibold mb-1 ${isAtual ? 'text-blue-400' : isFuturo ? 'text-slate-500' : 'text-slate-400'}`}>
                  {d.label}
                </div>
                <div className={`text-sm font-bold tabular-nums ${isAtual ? 'text-blue-300' : isFuturo ? 'text-slate-500' : 'text-white'}`}>
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

      {/* Per-card breakdown */}
      {mesSel && mesSel.por_cartao.some((c) => c.valor > 0) && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="text-xs text-slate-500 mb-3">
            {mesSel.label} {mesSel.ano}
            {mesSel.tipo === 'futuro' && ' — projeção do mês'}
            {mesSel.tipo === 'passado' && ' — total do mês'}
            {mesSel.tipo === 'atual' && ' — total do mês atual'}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Total de despesas</div>
              <div className="mt-1 text-sm font-semibold text-white tabular-nums">{formatarMoeda(mesSel.total)}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Já debitadas</div>
              <div className="mt-1 text-sm font-semibold text-emerald-300 tabular-nums">{formatarMoeda(mesSel.total_debitado)}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Ativas</div>
              <div className="mt-1 text-sm font-semibold text-amber-300 tabular-nums">{formatarMoeda(mesSel.total_previsto)}</div>
            </div>
          </div>
          <div className="space-y-2">
            {mesSel.por_cartao
              .filter((c) => c.valor > 0)
              .sort((a, b) => b.valor - a.valor)
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <BankLogo banco={c.banco} size={20} className="h-5 w-5 object-contain flex-shrink-0" />
                    <span className="text-xs text-slate-300 truncate">{c.nome}</span>
                  </div>
                  <span className="text-xs font-semibold text-white tabular-nums flex-shrink-0">
                    {formatarMoeda(c.valor)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

type StatusImportacao = {
  cartaoId: string;
  tipo: 'info' | 'sucesso' | 'erro';
  mensagem: string;
};

type FiltroLancamentoCartao = 'todos' | 'pendentes' | 'pagas' | 'atrasadas';

type LancamentoCartaoExibicao = {
  transacao: Transacao;
  dataExibicao: string;
  status: 'ativa' | 'atrasada' | 'paga';
};

type RespostaImportacao = {
  tipo?: string;
  resposta?: string;
  totalValor?: number;
  transacoes?: TransacaoExtraida[];
  transacao?: TransacaoExtraida;
  error?: string;
};

function normalizarTexto(valor: string | null | undefined) {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolverCategoriaId(tx: TransacaoExtraida, categorias: Categoria[]) {
  const nomeTx = normalizarTexto(tx.categoria);
  const exata = categorias.find((categoria) => (
    categoria.tipo === tx.tipo && normalizarTexto(categoria.nome) === nomeTx
  ));
  if (exata) return exata.id;

  const mapaFallback: Record<string, string[]> = {
    alimentacao: ['alimentacao', 'almoco', 'restaurante'],
    mercado: ['mercado', 'supermercado', 'atacadao'],
    transporte: ['transporte', 'uber', 'combustivel', 'posto'],
    saude: ['saude', 'hospital', 'clinica'],
    educacao: ['educacao', 'curso', 'faculdade'],
    lazer: ['lazer', 'cinema', 'show'],
    roupas: ['roupas', 'vestuario', 'moda'],
    moradia: ['moradia', 'aluguel', 'casa'],
    assinaturas: ['assinaturas', 'streaming', 'netflix', 'spotify'],
    contas: ['contas', 'energia', 'agua', 'internet'],
    pet: ['pet', 'veterinario'],
    beleza: ['beleza', 'salao'],
    presentes: ['presentes', 'presente'],
    farmacia: ['farmacia', 'drogaria'],
    delivery: ['delivery', 'ifood', 'rappi'],
    salario: ['salario'],
    freelance: ['freelance'],
    rendimentos: ['rendimentos', 'investimento'],
  };

  const fallback = categorias.find((categoria) => {
    if (categoria.tipo !== tx.tipo) return false;
    const nomeCategoria = normalizarTexto(categoria.nome);
    return Object.values(mapaFallback).some((termos) => (
      termos.some((termo) => nomeTx.includes(termo) && nomeCategoria.includes(termo))
    ));
  });

  if (fallback) return fallback.id;

  return categorias.find((categoria) => (
    categoria.tipo === tx.tipo && normalizarTexto(categoria.nome).includes('outros')
  ))?.id || categorias.find((categoria) => categoria.tipo === tx.tipo)?.id || '';
}

function getPeriodoFatura(diaFechamento: number, diaVencimento: number): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-based

  // When diaVencimento < diaFechamento, payment falls in the NEXT month after closing.
  // e.g.: closes day 30, due day 5 → April purchases paid in May's invoice.
  // We determine which invoice is "current" based on whether today is before or after vencimento.
  if (diaVencimento < diaFechamento) {
    if (diaHoje <= diaVencimento) {
      // Before this month's due date → show the invoice that closed last month (pending payment)
      // That invoice covers: (2 months ago day fechamento+1) to (last month day fechamento)
      return {
        inicio: new Date(ano, mes - 2, diaFechamento + 1),
        fim: new Date(ano, mes - 1, diaFechamento),
      };
    }
    // After this month's due date → show the invoice currently being built
    // That invoice covers: (last month day fechamento+1) to (this month day fechamento)
    return {
      inicio: new Date(ano, mes - 1, diaFechamento + 1),
      fim: new Date(ano, mes, diaFechamento),
    };
  }

  // Standard case: diaVencimento >= diaFechamento → payment in same month as closing
  if (diaHoje <= diaFechamento) {
    // Período ainda aberto: iniciou no mês anterior, fecha este mês
    return {
      inicio: new Date(ano, mes - 1, diaFechamento + 1),
      fim: new Date(ano, mes, diaFechamento),
    };
  }
  // Período recém-aberto após o fechamento deste mês
  return {
    inicio: new Date(ano, mes, diaFechamento + 1),
    fim: new Date(ano, mes + 1, diaFechamento),
  };
}

function getProximoPeriodoFatura(fimPeriodoAtual: Date, diaFechamento: number) {
  const inicio = new Date(fimPeriodoAtual.getFullYear(), fimPeriodoAtual.getMonth(), fimPeriodoAtual.getDate() + 1);
  const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, diaFechamento);
  return { inicio, fim };
}

function construirLancamentosDaFatura(
  cartao: CartaoCredito,
  cartaoId: string,
  transacoes: Transacao[],
  inicio: Date,
  fim: Date,
  referencia = new Date(),
) {
  const mesesPeriodo: Array<{ mes: number; ano: number }> = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const ultimo = new Date(fim.getFullYear(), fim.getMonth(), 1);

  while (cursor <= ultimo) {
    mesesPeriodo.push({ mes: cursor.getMonth() + 1, ano: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const lista: LancamentoCartaoExibicao[] = [];

  transacoes.forEach((transacao) => {
    if (transacao.cartao_id !== cartaoId) return;

    mesesPeriodo.forEach(({ mes, ano }) => {
      const ocorrencia = getDataOcorrenciaNoMes(transacao, mes, ano);
      if (!ocorrencia || ocorrencia < inicio || ocorrencia > fim) return;
      const dataCobranca = transacao.data_cobranca
        ? transacao.data_cobranca
        : getDataCobrancaCartaoParaData(formatFinancialDate(ocorrencia), cartao);
      const statusPagamento = getStatusPagamentoOcorrencia(transacao, dataCobranca, referencia);

      lista.push({
        transacao,
        dataExibicao: dataCobranca,
        status: statusPagamento === 'paga'
          ? 'paga'
          : statusPagamento === 'atrasada'
          ? 'atrasada'
          : 'ativa',
      });
    });
  });

  return lista.sort((a, b) => {
    const chaveA = `${a.dataExibicao}T${a.transacao.horario || '00:00'}:${a.transacao.id}`;
    const chaveB = `${b.dataExibicao}T${b.transacao.horario || '00:00'}:${b.transacao.id}`;
    return chaveA < chaveB ? 1 : -1;
  });
}

export default function Cartoes() {
  const {
    cartoes,
    categorias,
    contas,
    transacoes,
    config,
    adicionarCartao,
    editarCartao,
    excluirCartao,
    excluirTransacao,
    atualizarFaturaCartao,
    adicionarTransacao,
    marcarFaturaCartaoComoPaga,
  } = useFinanceiroStore();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cartaoEmEdicao, setCartaoEmEdicao] = useState<CartaoCredito | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novaFatura, setNovaFatura] = useState('');
  const [cartaoExpandidoId, setCartaoExpandidoId] = useState<string | null>(null);
  const [cartaoImportandoId, setCartaoImportandoId] = useState<string | null>(null);
  const [statusImportacao, setStatusImportacao] = useState<StatusImportacao | null>(null);
  const [filtroLancamentos, setFiltroLancamentos] = useState<FiltroLancamentoCartao>('todos');
  const [transacaoEditando, setTransacaoEditando] = useState<Transacao | undefined>();
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [transacaoDetalhe, setTransacaoDetalhe] = useState<Transacao | null>(null);
  const arquivoCartaoRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    banco: 'nubank' as BancoSlug,
    nome: '',
    limite: '',
    fatura_atual: '',
    dia_vencimento: '15',
    dia_fechamento: '8',
    bandeira: 'mastercard' as BandeirCartao,
  });

  const transacoesPorCartao = useMemo(() => {
    const mapa: Record<string, Transacao[]> = {};
    transacoes.forEach((transacao) => {
      if (!transacao.cartao_id) return;
      mapa[transacao.cartao_id] = [...(mapa[transacao.cartao_id] || []), transacao];
    });
    return mapa;
  }, [transacoes]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      banco: form.banco,
      nome: form.nome || `${BANCO_INFO[form.banco].nome} ${form.bandeira}`,
      limite: parseFloat(form.limite) || 0,
      fatura_atual: parseFloat(form.fatura_atual) || 0,
      dia_vencimento: parseInt(form.dia_vencimento, 10) || 15,
      dia_fechamento: parseInt(form.dia_fechamento, 10) || 8,
      bandeira: form.bandeira,
    };

    if (cartaoEmEdicao) {
      editarCartao(cartaoEmEdicao.id, payload);
    } else {
      adicionarCartao(payload);
    }

    setForm({
      banco: 'nubank',
      nome: '',
      limite: '',
      fatura_atual: '',
      dia_vencimento: '15',
      dia_fechamento: '8',
      bandeira: 'mastercard',
    });
    setCartaoEmEdicao(null);
    setMostrarForm(false);
  }

  function abrirEdicaoCartao(cartao: CartaoCredito) {
    setCartaoEmEdicao(cartao);
    setForm({
      banco: cartao.banco,
      nome: cartao.nome,
      limite: String(cartao.limite),
      fatura_atual: String(cartao.fatura_atual),
      dia_vencimento: String(cartao.dia_vencimento),
      dia_fechamento: String(cartao.dia_fechamento),
      bandeira: cartao.bandeira,
    });
    setMostrarForm(true);
  }

  function fecharFormularioCartao() {
    setMostrarForm(false);
    setCartaoEmEdicao(null);
    setForm({
      banco: 'nubank',
      nome: '',
      limite: '',
      fatura_atual: '',
      dia_vencimento: '15',
      dia_fechamento: '8',
      bandeira: 'mastercard',
    });
  }

  function salvarFatura(id: string) {
    const valor = parseFloat(novaFatura.replace(',', '.'));
    if (!Number.isNaN(valor)) atualizarFaturaCartao(id, valor);
    setEditandoId(null);
    setNovaFatura('');
  }

  function abrirEdicaoLancamento(transacao: Transacao) {
    setTransacaoDetalhe(null);
    setTransacaoEditando(transacao);
    setModalEdicaoAberto(true);
  }

  function removerLancamento(transacao: Transacao) {
    if (!confirm('Excluir este lançamento do cartão?')) return;
    excluirTransacao(transacao.id);
  }

  function quitarFaturaCartao(cartao: CartaoCredito, listaAtual: LancamentoCartaoExibicao[]) {
    const pendencias = listaAtual
      .filter((item) => item.status !== 'paga')
      .map((item) => ({
        transacaoId: item.transacao.id,
        dataOcorrencia: item.dataExibicao,
      }));

    if (pendencias.length === 0) return;

    const confirmar = confirm(`Marcar a fatura de ${cartao.nome} como paga? ${pendencias.length} lançamento(s) serão quitados.`);
    if (!confirmar) return;

    marcarFaturaCartaoComoPaga(cartao.id, pendencias);
    setStatusImportacao({
      cartaoId: cartao.id,
      tipo: 'sucesso',
      mensagem: `Fatura marcada como paga. Os lançamentos quitados saíram desta fatura atual.`,
    });
  }

  async function handleImportarArquivoCartao(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';

    if (!arquivo || !cartaoImportandoId) return;

    const cartao = cartoes.find((item) => item.id === cartaoImportandoId);
    if (!cartao) return;
    const periodoReferencia = solicitarPeriodoReferenciaCartao(cartao, arquivo.name);
    if (!periodoReferencia) {
      setCartaoImportandoId(null);
      return;
    }
    const dataCobrancaReferencia = getDataCobrancaPorReferencia(cartao, periodoReferencia);
    const memoriaChave = `cartao:${cartao.id}:importacao`;

    setStatusImportacao({
      cartaoId: cartao.id,
      tipo: 'info',
      mensagem: 'IA analisando a lista de lancamentos do cartao...',
    });

    try {
      const lowerName = arquivo.name.toLowerCase();
      const isPdf = arquivo.type === 'application/pdf' || lowerName.endsWith('.pdf');
      const isCsv = arquivo.type === 'text/csv' || lowerName.endsWith('.csv');
      const formData = new FormData();

      if (isPdf) {
        formData.append('task', 'analisar_pdf_financeiro');
        formData.append('pdf', arquivo);
      } else if (isCsv) {
        formData.append('task', 'analisar_csv_financeiro');
        formData.append('csv', arquivo);
      } else {
        formData.append('task', 'analisar_imagem_financeira');
        formData.append('imagem', arquivo);
        formData.append('legenda', `Lista de lancamentos do cartao ${cartao.nome} do banco ${BANCO_INFO[cartao.banco].nome}. Extraia data, detalhe da compra, parcela e valor.`);
      }
      formData.append('provider', config.ai_modelo_ocr_padrao || 'automatico');
      formData.append('mode', (config.ai_modelo_ocr_padrao || 'automatico') !== 'automatico' ? 'manual' : 'auto');
      formData.append('financialProvider', config.ai_modelo_padrao || 'automatico');
      formData.append('periodo_referencia', periodoReferencia);
      formData.append('memoria_chave', memoriaChave);

      const resposta = await fetch('/api/ai', {
        method: 'POST',
        body: formData,
      });

      const data = await resposta.json() as RespostaImportacao;
      if (!resposta.ok) {
        throw new Error(data.error || 'Erro ao analisar o arquivo do cartao.');
      }

      const extraidas = data.transacoes || (data.transacao ? [data.transacao] : []);
      if (!extraidas.length) {
        throw new Error(data.resposta || 'A IA nao encontrou lancamentos validos nesse arquivo.');
      }

      const existentes = [...(transacoesPorCartao[cartao.id] || [])];
      let importadas = 0;
      let ignoradasPorDuplicidade = 0;

      extraidas.forEach((tx) => {
        const duplicada = tx.tipo === 'despesa'
          ? existeValorNaFaturaDoMes(existentes, cartao, tx.valor, dataCobrancaReferencia)
          : existentes.some((existente) => (
              existente.tipo === tx.tipo
              && Math.abs(existente.valor - tx.valor) < 0.01
              && getChaveFaturaMes(existente.data_cobranca || existente.data) === getChaveFaturaMes(dataCobrancaReferencia)
            ));

        if (duplicada) {
          ignoradasPorDuplicidade += 1;
          return;
        }

        adicionarTransacao({
          valor: tx.valor,
          descricao: tx.descricao,
          categoria_id: resolverCategoriaId(tx, categorias),
          data: tx.data,
          horario: tx.hora || undefined,
          tipo: tx.tipo,
          metodo_pagamento: 'credito',
          parcelas: tx.parcelas || undefined,
          data_cobranca: dataCobrancaReferencia,
          local: tx.local || undefined,
          origem: isPdf || isCsv ? 'assistente' : 'assistente_imagem',
          cartao_id: cartao.id,
        });

        existentes.push({
          id: `tmp-${cartao.id}-${importadas}`,
          valor: tx.valor,
          descricao: tx.descricao,
          categoria_id: resolverCategoriaId(tx, categorias),
          data: tx.data,
          data_cobranca: dataCobrancaReferencia,
          tipo: tx.tipo,
          origem: isPdf || isCsv ? 'assistente' : 'assistente_imagem',
          criado_em: new Date().toISOString(),
        });
        importadas += 1;
      });

      setCartaoExpandidoId(cartao.id);
      setStatusImportacao({
        cartaoId: cartao.id,
        tipo: 'sucesso',
        mensagem: importadas > 0
          ? `${importadas} novo${importadas > 1 ? 's' : ''} lancamento${importadas > 1 ? 's foram' : ' foi'} incluido${importadas > 1 ? 's' : ''} na fatura de ${getDescricaoPeriodoReferencia(periodoReferencia)}.${ignoradasPorDuplicidade > 0 ? ` ${ignoradasPorDuplicidade} cobranca${ignoradasPorDuplicidade > 1 ? 's foram' : ' foi'} ignorada${ignoradasPorDuplicidade > 1 ? 's' : ''} por ja existir${ignoradasPorDuplicidade > 1 ? 'em' : ''} nesse mes pelo valor exato.` : ''}`
          : `Nenhum novo lancamento foi incluido. As cobrancas desse arquivo ja existiam na fatura de ${getDescricaoPeriodoReferencia(periodoReferencia)} pelo valor exato.`,
      });
    } catch (error) {
      setStatusImportacao({
        cartaoId: cartao.id,
        tipo: 'erro',
        mensagem: error instanceof Error ? error.message : 'Nao foi possivel importar os lancamentos desse cartao.',
      });
    } finally {
      setCartaoImportandoId(null);
    }
  }

  const totalFaturas = cartoes.reduce((soma, cartao) => soma + cartao.fatura_atual, 0);
  const totalLimite = cartoes.reduce((soma, cartao) => soma + cartao.limite, 0);
  const totalDisponivel = totalLimite - totalFaturas;

  return (
    <div className="space-y-5 animate-fade-up">
      <input
        ref={arquivoCartaoRef}
        type="file"
        accept="application/pdf,.pdf,text/csv,.csv,image/*"
        className="hidden"
        onChange={handleImportarArquivoCartao}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Cartões de Crédito</h2>
          <p className="text-slate-500 text-sm">
            Fatura total:{' '}
            <span className="text-red-400 font-semibold tabular-nums">{formatarMoeda(totalFaturas)}</span>
          </p>
        </div>
        <button
          onClick={() => {
            if (mostrarForm) {
              fecharFormularioCartao();
            } else {
              setMostrarForm(true);
            }
          }}
          className="btn-primary flex items-center gap-2 text-white px-3 py-2 rounded-xl text-sm font-medium"
        >
          <Plus size={16} /> {mostrarForm ? 'Fechar' : 'Novo Cartão'}
        </button>
      </div>

      <div className="glass-card p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Limite Total</div>
            <div className="text-lg font-bold text-white tabular-nums">{formatarMoeda(totalLimite)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Faturas</div>
            <div className="text-lg font-bold text-red-400 tabular-nums">{formatarMoeda(totalFaturas)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Disponível</div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums">{formatarMoeda(totalDisponivel)}</div>
          </div>
        </div>

        {totalLimite > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Uso do limite</span>
              <span>{((totalFaturas / totalLimite) * 100).toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min((totalFaturas / totalLimite) * 100, 100)}%`,
                  background:
                    totalFaturas / totalLimite > 0.8
                      ? '#EF4444'
                      : totalFaturas / totalLimite > 0.5
                        ? '#F59E0B'
                        : '#7C3AED',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <TimelineFaturas cartoes={cartoes} transacoes={transacoes} />

      {mostrarForm && (
        <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4 border-purple-500/30">
          <h3 className="text-sm font-semibold text-purple-300">{cartaoEmEdicao ? 'Editar cartão' : 'Novo cartão'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Banco *</label>
              <BankSelector
                selected={form.banco}
                onChange={(banco) => setForm((anterior) => ({ ...anterior, banco }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Bandeira</label>
              <select
                value={form.bandeira}
                onChange={(e) => setForm((anterior) => ({ ...anterior, bandeira: e.target.value as BandeirCartao }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              >
                {BANDEIRAS.map((bandeira) => (
                  <option key={bandeira} value={bandeira}>
                    {bandeira.charAt(0).toUpperCase() + bandeira.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nome do cartão (opcional)</label>
            <input
              type="text"
              placeholder="Ex: Nubank Roxinho"
              value={form.nome}
              onChange={(e) => setForm((anterior) => ({ ...anterior, nome: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Limite (R$) *</label>
              <input
                type="number"
                placeholder="0,00"
                step="0.01"
                required
                value={form.limite}
                onChange={(e) => setForm((anterior) => ({ ...anterior, limite: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Fatura Atual (R$)</label>
              <input
                type="number"
                placeholder="0,00"
                step="0.01"
                value={form.fatura_atual}
                onChange={(e) => setForm((anterior) => ({ ...anterior, fatura_atual: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Dia do vencimento</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dia_vencimento}
                onChange={(e) => setForm((anterior) => ({ ...anterior, dia_vencimento: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Dia do fechamento</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dia_fechamento}
                onChange={(e) => setForm((anterior) => ({ ...anterior, dia_fechamento: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 text-white py-2.5 rounded-xl text-sm font-semibold">
              Salvar
            </button>
            <button
              type="button"
              onClick={fecharFormularioCartao}
              className="px-4 bg-white/5 text-slate-400 py-2.5 rounded-xl text-sm hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {cartoes.map((cartao) => {
          const info = BANCO_INFO[cartao.banco];
          const emEdicao = editandoId === cartao.id;
          const expandido = cartaoExpandidoId === cartao.id;
          const statusAtual = statusImportacao?.cartaoId === cartao.id ? statusImportacao : null;
          const periodoAtual = getPeriodoFatura(cartao.dia_fechamento, cartao.dia_vencimento);
          const listaPeriodoAtual = construirLancamentosDaFatura(
            cartao,
            cartao.id,
            transacoesPorCartao[cartao.id] || [],
            periodoAtual.inicio,
            periodoAtual.fim,
          );
          const faturaAtualPendente = listaPeriodoAtual.filter((item) => item.transacao.tipo === 'despesa' && item.status !== 'paga');
          const periodoSeguinte = getProximoPeriodoFatura(periodoAtual.fim, cartao.dia_fechamento);
          const listaProximaFatura = construirLancamentosDaFatura(
            cartao,
            cartao.id,
            transacoesPorCartao[cartao.id] || [],
            periodoSeguinte.inicio,
            periodoSeguinte.fim,
          );
          const mostrarProximaFatura = faturaAtualPendente.length === 0 && listaPeriodoAtual.some((item) => item.transacao.tipo === 'despesa');
          const inicioFatura = mostrarProximaFatura ? periodoSeguinte.inicio : periodoAtual.inicio;
          const fimFatura = mostrarProximaFatura ? periodoSeguinte.fim : periodoAtual.fim;
          const listaCompleta = mostrarProximaFatura
            ? listaProximaFatura
            : listaPeriodoAtual;
          const lista = listaCompleta.filter((item) => (
            filtroLancamentos === 'todos'
              ? true
              : filtroLancamentos === 'pendentes'
              ? item.status === 'ativa' || item.status === 'atrasada'
              : filtroLancamentos === 'pagas'
              ? item.status === 'paga'
              : item.status === 'atrasada'
          ));
          const compras = listaCompleta.filter((item) => item.transacao.tipo === 'despesa');
          const estornos = listaCompleta.filter((item) => item.transacao.tipo === 'receita');
          const comprasPendentes = compras.filter((item) => item.status !== 'paga');
          const estornosPendentes = estornos.filter((item) => item.status !== 'paga');
          const baseLancamentos = comprasPendentes.reduce((soma, item) => soma + item.transacao.valor, 0)
            - estornosPendentes.reduce((soma, item) => soma + item.transacao.valor, 0);
          const faturaEmAberto = Math.max(baseLancamentos, 0);
          const percentual = cartao.limite > 0 ? (faturaEmAberto / cartao.limite) * 100 : 0;
          const disponivel = cartao.limite - faturaEmAberto;
          const totalPrevistas = listaCompleta
            .filter((item) => (item.status === 'ativa' || item.status === 'atrasada') && item.transacao.tipo === 'despesa')
            .reduce((soma, item) => soma + item.transacao.valor, 0);
          const totalDebitado = listaCompleta
            .filter((item) => item.status === 'paga' && item.transacao.tipo === 'despesa')
            .reduce((soma, item) => soma + item.transacao.valor, 0);
          const totalAtrasado = listaCompleta
            .filter((item) => item.status === 'atrasada' && item.transacao.tipo === 'despesa')
            .reduce((soma, item) => soma + item.transacao.valor, 0);
          const comprasProximaFatura = listaProximaFatura.filter((item) => item.transacao.tipo === 'despesa');
          const estornosProximaFatura = listaProximaFatura.filter((item) => item.transacao.tipo === 'receita');
          const totalProximaFatura = comprasProximaFatura.reduce((soma, item) => soma + item.transacao.valor, 0)
            - estornosProximaFatura.reduce((soma, item) => soma + item.transacao.valor, 0);
          const datasPendentesFaturaAtual = faturaAtualPendente.map((item) => parseFinancialDate(item.dataExibicao));
          const dataVencimentoAtual = datasPendentesFaturaAtual.length
            ? new Date(Math.max(...datasPendentesFaturaAtual.map((data) => data.getTime())))
            : null;
          const atrasoDias = dataVencimentoAtual
            ? Math.floor((startOfTodayLocal().getTime() - dataVencimentoAtual.getTime()) / 86400000)
            : -1;
          const faturaAtrasada = Boolean(dataVencimentoAtual && atrasoDias > 0);
          const diasVencimento = dataVencimentoAtual
            ? Math.ceil((dataVencimentoAtual.getTime() - startOfTodayLocal().getTime()) / 86400000)
            : 0;
          const urgente = !faturaAtrasada && diasVencimento <= 5 && diasVencimento >= 0 && faturaAtualPendente.length > 0;
          const podeQuitarFatura = faturaAtualPendente.length > 0 && Boolean(dataVencimentoAtual && dataVencimentoAtual <= startOfTodayLocal());

          return (
            <div key={cartao.id} className={`glass-card overflow-hidden ${urgente || faturaAtrasada ? 'border-red-500/30' : ''}`}>
              <div
                className="p-5 relative"
                style={{ background: `linear-gradient(135deg, ${info.cor}15 0%, transparent 60%)` }}
              >
                {faturaAtrasada && (
                  <div className="flex items-center gap-2 text-red-400 text-xs mb-3 font-medium">
                    <AlertCircle size={13} />
                    Fatura vencida há {atrasoDias} dia{atrasoDias !== 1 ? 's' : ''}. Marque como paga para limpar esta cobrança.
                  </div>
                )}
                {!faturaAtrasada && urgente && (
                  <div className="flex items-center gap-2 text-red-400 text-xs mb-3 font-medium">
                    <AlertCircle size={13} />
                    Vencimento em {diasVencimento} dia{diasVencimento !== 1 ? 's' : ''}!
                  </div>
                )}
                {mostrarProximaFatura && (
                  <div className="mb-3 inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
                    Fatura anterior quitada • exibindo próxima
                  </div>
                )}

                <div className="flex items-center justify-between mb-5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      <BankLogo banco={cartao.banco} size={44} className="h-11 w-11 object-contain" />
                      <CardBrandLogo
                        banco={cartao.banco}
                        nomeCartao={cartao.nome}
                        bandeira={cartao.bandeira}
                        size={20}
                        className="absolute -bottom-1 -right-1 h-5 w-5 object-contain shadow-sm"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{cartao.nome}</div>
                      <div className="text-xs text-slate-500">
                        {info.nome} • {cartao.bandeira}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setCartaoImportandoId(cartao.id);
                        arquivoCartaoRef.current?.click();
                      }}
                      className="text-purple-300 hover:text-white bg-purple-600/15 border border-purple-500/25 px-2.5 py-1.5 rounded-lg hover:bg-purple-600/25 transition-colors flex items-center gap-1.5 text-xs font-medium"
                      aria-label="Importar fatura com IA"
                    >
                      {cartaoImportandoId === cartao.id ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                      I.A
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        abrirEdicaoCartao(cartao);
                      }}
                      className="text-slate-500 hover:text-purple-400 p-1.5 rounded-lg hover:bg-purple-900/20 transition-colors"
                      aria-label="Editar cartão"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (confirm('Excluir este cartão?')) excluirCartao(cartao.id);
                      }}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                      aria-label="Excluir cartão"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCartaoExpandidoId((atual) => atual === cartao.id ? null : cartao.id)}
                  className="w-full text-left"
                >
                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                          <span>Fatura Atual</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditandoId(cartao.id);
                              setNovaFatura(cartao.fatura_atual.toString());
                            }}
                            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-purple-300"
                            aria-label="Ajustar fatura total"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                        {!emEdicao && (
                          <div className="mb-1 text-[11px] text-slate-500">
                            Em aberto nesta fatura: <span className="text-slate-300 tabular-nums">{formatarMoeda(baseLancamentos)}</span>
                            {totalProximaFatura > 0 ? <> {' '}• Próxima: <span className="text-blue-300 tabular-nums">{formatarMoeda(totalProximaFatura)}</span></> : null}
                            {cartao.fatura_ajuste_manual
                              ? <> {' '}• Ajuste manual: <span className="text-purple-300 tabular-nums">{formatarMoeda(cartao.fatura_ajuste_manual)}</span></>
                              : null}
                          </div>
                        )}
                        {emEdicao ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              autoFocus
                              value={novaFatura}
                              onChange={(e) => setNovaFatura(e.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') salvarFatura(cartao.id);
                              }}
                              className="w-36 bg-white/10 border border-white/20 text-white text-lg rounded-xl px-3 py-1.5 outline-none focus:border-purple-500 tabular-nums font-bold"
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                salvarFatura(cartao.id);
                              }}
                              className="text-emerald-400 p-1.5 rounded-lg hover:bg-emerald-900/20"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditandoId(null);
                              }}
                              className="text-slate-500 p-1.5 rounded-lg hover:bg-white/10"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`text-2xl font-bold tabular-nums ${
                              percentual > 80 ? 'text-red-400' : percentual > 50 ? 'text-yellow-400' : 'text-white'
                            }`}
                          >
                            {formatarMoeda(baseLancamentos)}
                          </div>
                        )}
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-slate-500 transition-transform ${expandido ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(percentual, 100)}%`,
                          background: percentual > 80 ? '#EF4444' : percentual > 50 ? '#F59E0B' : info.cor,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>
                        Usado: <span className="text-slate-300 font-medium">{percentual.toFixed(1)}%</span>
                      </span>
                      <span>
                        Limite:{' '}
                        <span className="text-slate-300 font-medium tabular-nums">{formatarMoeda(cartao.limite)}</span>
                      </span>
                    </div>
                  </div>

                    <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                      <div className="text-emerald-400 text-sm font-bold tabular-nums">{formatarMoeda(disponivel)}</div>
                      <div className="text-slate-600 text-[11px] mt-0.5">Disponível</div>
                    </div>
                    <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                      <div className={`text-sm font-bold ${diasVencimento <= 5 ? 'text-red-400' : 'text-slate-300'}`}>
                        {diasVencimento}d
                      </div>
                      <div className="text-slate-600 text-[11px] mt-0.5">p/ vencer</div>
                    </div>
                    <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                      <div className="text-slate-300 text-sm font-bold">{compras.length}</div>
                      <div className="text-slate-600 text-[11px] mt-0.5">
                        {expandido ? 'lançamentos visíveis' : 'clique para ver gastos'}
                      </div>
                    </div>
                    </div>

                    {totalProximaFatura > 0 && (
                      <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
                        Próxima fatura: {comprasProximaFatura.length} lançamento(s) • {formatarMoeda(totalProximaFatura)}
                      </div>
                    )}
                </button>

                {statusAtual && (
                  <div className={`mt-3 rounded-2xl px-3 py-2 text-xs border ${
                    statusAtual.tipo === 'sucesso'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : statusAtual.tipo === 'erro'
                      ? 'bg-red-500/10 border-red-500/20 text-red-300'
                      : 'bg-purple-500/10 border-purple-500/20 text-purple-300'
                  }`}>
                    {statusAtual.mensagem}
                  </div>
                )}

                {expandido && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Gastos do cartão</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Os lançamentos importados pela I.A. ficam vinculados a este cartão com data, detalhe da compra, parcela e valor.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {podeQuitarFatura && (
                          <button
                            type="button"
                            onClick={() => quitarFaturaCartao(cartao, listaPeriodoAtual)}
                            className="px-3 py-2 rounded-xl text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-all"
                          >
                            Marcar fatura como paga
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setCartaoImportandoId(cartao.id);
                            arquivoCartaoRef.current?.click();
                          }}
                          className="px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
                        >
                          <Brain size={14} />
                          Atualizar com I.A.
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Compras</div>
                        <div className="text-sm font-semibold text-white mt-1">{compras.length}</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Estornos / créditos</div>
                        <div className="text-sm font-semibold text-emerald-400 mt-1 tabular-nums">
                          {formatarMoeda(estornos.reduce((soma, item) => soma + item.transacao.valor, 0))}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Período da fatura</div>
                        <div className="text-xs font-semibold text-white mt-1">
                          {inicioFatura.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          {' – '}
                          {fimFatura.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Total do mês</div>
                        <div className="text-sm font-semibold text-white mt-1 tabular-nums">{formatarMoeda(baseLancamentos)}</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Já pagas</div>
                        <div className="text-sm font-semibold text-emerald-300 mt-1 tabular-nums">{formatarMoeda(totalDebitado)}</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Pendentes</div>
                        <div className="text-sm font-semibold text-amber-300 mt-1 tabular-nums">{formatarMoeda(totalPrevistas)}</div>
                      </div>
                    </div>

                    {totalProximaFatura > 0 && (
                      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-blue-200">Próxima fatura</h4>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {periodoSeguinte.inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              {' – '}
                              {periodoSeguinte.fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-slate-500">Total previsto</div>
                            <div className="mt-1 text-sm font-semibold text-blue-300 tabular-nums">{formatarMoeda(totalProximaFatura)}</div>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {listaProximaFatura.slice(0, 6).map(({ transacao, dataExibicao, status }) => {
                            const categoria = categorias.find((item) => item.id === transacao.categoria_id);
                            return (
                              <div key={`proxima-${transacao.id}-${dataExibicao}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm text-white">{transacao.descricao}</div>
                                  <div className="text-[11px] text-slate-500">
                                    cobra em {parseFinancialDate(dataExibicao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    {categoria?.nome ? ` • ${categoria.nome}` : ''}
                                    {` • ${status === 'paga' ? 'paga' : status === 'atrasada' ? 'em atraso' : 'pendente'}`}
                                  </div>
                                </div>
                                <div className={`text-sm font-semibold tabular-nums ${transacao.tipo === 'receita' ? 'text-emerald-400' : 'text-blue-300'}`}>
                                  {transacao.tipo === 'receita' ? '+' : '-'}{formatarMoeda(transacao.valor)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {totalAtrasado > 0 && (
                      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                        Há {formatarMoeda(totalAtrasado)} em atraso nesta fatura.
                      </div>
                    )}

                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                      {([
                        { valor: 'todos', label: 'Todos' },
                        { valor: 'pendentes', label: 'Pendentes' },
                        { valor: 'pagas', label: 'Pagas' },
                        { valor: 'atrasadas', label: 'Atrasadas' },
                      ] as const).map((filtro) => (
                        <button
                          key={filtro.valor}
                          type="button"
                          onClick={() => setFiltroLancamentos(filtro.valor)}
                          className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                            filtroLancamentos === filtro.valor
                              ? 'bg-purple-600 text-white'
                              : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white'
                          }`}
                        >
                          {filtro.label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {lista.slice(0, 12).map(({ transacao, dataExibicao, status }) => {
                        const categoria = categorias.find((item) => item.id === transacao.categoria_id);
                        const emAtraso = status === 'atrasada';
                        return (
                          <div
                            key={`${transacao.id}-${dataExibicao}`}
                            className={`rounded-2xl border px-3 py-2 flex items-center gap-3 ${
                              emAtraso
                                ? 'border-red-500/25 bg-red-500/10'
                                : status === 'paga'
                                ? 'border-emerald-500/15 bg-emerald-500/5'
                                : 'border-white/8 bg-white/[0.02]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setTransacaoDetalhe(transacao)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                                style={{ background: categoria?.cor ? `${categoria.cor}22` : 'rgba(255,255,255,0.05)' }}
                              >
                                {categoria?.icone || '•'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white truncate">{transacao.descricao}</div>
                                <div className={`text-[11px] ${emAtraso ? 'text-red-200/80' : 'text-slate-500'}`}>
                                  cobra em {parseFinancialDate(dataExibicao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  {transacao.parcelas && transacao.parcelas > 1 ? ` • ${transacao.parcelas}x` : ''}
                                  {categoria?.nome ? ` • ${categoria.nome}` : ''}
                                  {` • ${status === 'ativa' ? 'pendente' : status === 'paga' ? 'paga' : 'em atraso'}`}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => removerLancamento(transacao)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-900/30 hover:text-red-300 transition-colors flex-shrink-0"
                              aria-label="Excluir lançamento do cartão"
                              title="Excluir lançamento"
                            >
                              <Trash2 size={14} />
                            </button>
                            <div className={`text-sm font-semibold tabular-nums flex-shrink-0 ${transacao.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {transacao.tipo === 'receita' ? '+' : '-'}{formatarMoeda(transacao.valor)}
                            </div>
                          </div>
                        );
                      })}
                      {lista.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-600">
                          Nenhum gasto visível ainda. Clique no botão I.A. para ler a fatura ou a lista de lançamentos deste cartão.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {cartoes.length === 0 && (
          <div className="glass-card flex flex-col items-center justify-center py-14 text-slate-600">
            <CreditCard size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">Nenhum cartão cadastrado</p>
            <p className="text-xs mt-1">Clique em &quot;Novo Cartão&quot; para começar</p>
          </div>
        )}
      </div>

      <ModalNovaTransacao
        aberto={modalEdicaoAberto}
        onFechar={() => {
          setModalEdicaoAberto(false);
          setTransacaoEditando(undefined);
        }}
        transacaoEditar={transacaoEditando}
        tipoInicial={transacaoEditando?.tipo || 'despesa'}
      />

      {transacaoDetalhe && (
        <ModalDetalheTransacao
          transacao={transacaoDetalhe}
          conta={contas.find(c => c.id === transacaoDetalhe.conta_id)}
          cartao={cartoes.find(c => c.id === transacaoDetalhe.cartao_id)}
          categoriaNome={categorias.find(c => c.id === transacaoDetalhe.categoria_id)?.nome || 'Outros'}
          onEditar={() => abrirEdicaoLancamento(transacaoDetalhe)}
          onFechar={() => setTransacaoDetalhe(null)}
        />
      )}
    </div>
  );
}
