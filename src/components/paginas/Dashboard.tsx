'use client';

import { useMemo, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Wallet, ArrowRight, Eye, EyeOff, CreditCard, Building2, Sparkles,
  Brain, ChevronDown, FileText, ImageIcon, Loader2,
  TrendingDown, TrendingUp, CheckCircle2, Clock, X,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { construirSnapshotFinanceiro } from '@/lib/contexto-financeiro';
import { formatarMoeda, mesAtual } from '@/lib/storage';
import { BANCO_INFO, BancoSlug, CartaoCredito, ContaBancaria, Categoria, Transacao } from '@/types';
import { calcularScore, ScoreFinanceiro } from '@/lib/score-financeiro';
import { calcularPrevisao } from '@/lib/previsao';
import { formatFinancialDate, isSameFinancialMonth, parseFinancialDate, startOfTodayLocal } from '@/lib/date';
import { getDataCobrancaCartao, getDataCompetenciaDespesa, getDataOcorrenciaNoMes, ordenarTransacoesPorDataDesc, transacaoContaNoMesAteData } from '@/lib/transacoes';
import {
  existeValorNaFaturaDoMes,
  getDataCobrancaPorReferencia,
  getChaveFaturaMes,
  getDescricaoPeriodoReferencia,
  solicitarPeriodoReferenciaCartao,
} from '@/lib/importacao-cartao';
import BankLogo from '@/components/ui/BankLogo';
import CardBrandLogo from '@/components/ui/CardBrandLogo';
import OCRModelSelect from '@/components/ui/OCRModelSelect';
import PainelPrioridadesFinanceiras, { type ItemPrioridadeFinanceira } from '@/components/ui/PainelPrioridadesFinanceiras';
import type { AIModelId } from '@/lib/ai/aiModels';
import ModalNovaTransacao from '@/components/modais/ModalNovaTransacao';
import ModalDetalheTransacao from '@/components/modais/ModalDetalheTransacao';
import { useCountUp } from '@/hooks/useCountUp';
import type { TransacaoExtraida } from '@/lib/assistente-types';

type Pagina = 'dashboard' | 'transacoes' | 'bancos' | 'cartoes' | 'relatorios' | 'investimentos' | 'assistente' | 'patrimonio' | 'orcamentos' | 'configuracoes' | 'agentes';
interface Props { onNovoPagina: (p: Pagina) => void; }

const CORES = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#F97316', '#8B5CF6'];
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const METODOS_DEBITO = new Set(['pix', 'debito', 'transferencia', 'dinheiro', 'emprestimo', 'financiamento']);

// Donut SVG interativo
interface DonutItem { nome: string; valor: number; cor: string; icone?: string }
function CategoryDonut({
  items,
  selectedCat,
  onSelect,
}: {
  items: DonutItem[];
  selectedCat: string | null;
  onSelect: (nome: string | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = items.reduce((s, i) => s + i.valor, 0);
  const cx = 80, cy = 80, r = 58, ri = 38;

  const slices = useMemo(() => {
    return items.reduce<Array<DonutItem & { start: number; sweep: number }>>((acc, item) => {
      const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].sweep : -Math.PI / 2;
      const sweep = total > 0 ? (item.valor / total) * 2 * Math.PI : 0;
      acc.push({ ...item, start, sweep });
      return acc;
    }, []);
  }, [items, total]);

  function polarToCart(cx: number, cy: number, r: number, angle: number) {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function slicePath(start: number, sweep: number, rOuter: number, rInner: number) {
    if (sweep < 0.001) return '';
    const [x1, y1] = polarToCart(cx, cy, rOuter, start);
    const [x2, y2] = polarToCart(cx, cy, rOuter, start + sweep);
    const [x3, y3] = polarToCart(cx, cy, rInner, start + sweep);
    const [x4, y4] = polarToCart(cx, cy, rInner, start);
    const large = sweep > Math.PI ? 1 : 0;
    return `M${x1},${y1} A${rOuter},${rOuter} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${rInner},${rInner} 0 ${large} 0 ${x4},${y4} Z`;
  }

  const activeIndex = hovered !== null ? hovered : items.findIndex(i => i.nome === selectedCat);
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null;

  return (
    <div className="flex gap-3 items-start">
      <div className="flex-shrink-0">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {slices.map((s, i) => {
            const isActive = i === activeIndex;
            const rO = isActive ? r + 4 : r;
            return (
              <path
                key={i}
                d={slicePath(s.start, s.sweep, rO, ri)}
                fill={s.cor}
                opacity={activeIndex >= 0 && !isActive ? 0.45 : 1}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s, d 0.15s' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(selectedCat === s.nome ? null : s.nome)}
              />
            );
          })}
          {/* Centro */}
          <circle cx={cx} cy={cy} r={ri - 2} fill="#0E1220" />
          {activeItem ? (
            <>
              <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="11" fontWeight="600">
                {activeItem.nome.length > 10 ? activeItem.nome.slice(0, 9) + '...' : activeItem.nome}
              </text>
              <text x={cx} y={cy + 10} textAnchor="middle" fill="#94A3B8" fontSize="9">
                {((activeItem.valor / (total || 1)) * 100).toFixed(0)}%
              </text>
            </>
          ) : (
            <text x={cx} y={cy + 4} textAnchor="middle" fill="#64748B" fontSize="10">
              {items.length} categ.
            </text>
          )}
        </svg>
      </div>
      <div className="flex-1 space-y-1 pt-1 max-h-[150px] overflow-y-auto pr-1">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => onSelect(selectedCat === item.nome ? null : item.nome)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all text-xs ${
              selectedCat === item.nome
                ? 'bg-white/10 ring-1 ring-white/20'
                : 'hover:bg-white/5'
            }`}
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.cor }} />
            <span className="text-slate-400 flex-1 truncate">{item.nome}</span>
            <span className="text-slate-300 tabular-nums font-medium">{formatarMoeda(item.valor)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Evolution Chart SVG
interface EvoPoint { mes: string; receitas: number; despesas: number }
function EvolutionChart({ data }: { data: EvoPoint[] }) {
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 600, H = 180, PAD = { top: 16, right: 16, bottom: 28, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxVal = useMemo(() => {
    const allVals = data.flatMap(d => [d.receitas, d.despesas]);
    return Math.max(...allVals, 1);
  }, [data]);

  function xOf(i: number) {
    return PAD.left + (i / Math.max(data.length - 1, 1)) * innerW;
  }
  function yOf(v: number) {
    return PAD.top + innerH - (v / maxVal) * innerH;
  }

  function makePath(key: 'receitas' | 'despesas') {
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(d[key])}`).join(' ');
  }
  function makeArea(key: 'receitas' | 'despesas') {
    const line = makePath(key);
    return `${line} L${xOf(data.length - 1)},${PAD.top + innerH} L${xOf(0)},${PAD.top + innerH} Z`;
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const relX = svgX - PAD.left;
    const step = innerW / Math.max(data.length - 1, 1);
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(relX / step)));
    setHover({ x: xOf(idx), idx });
  }

  const hItem = hover !== null ? data[hover.idx] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: 'crosshair' }}
      >
        <defs>
          <linearGradient id="evo-green" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity="0.3" />
            <stop offset="95%" stopColor="#10B981" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="evo-red" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#EF4444" stopOpacity="0.25" />
            <stop offset="95%" stopColor="#EF4444" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <line
            key={i}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + innerH * (1 - f)}
            y2={PAD.top + innerH * (1 - f)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}

        {/* Areas */}
        <path d={makeArea('receitas')} fill="url(#evo-green)" />
        <path d={makeArea('despesas')} fill="url(#evo-red)" />

        {/* Lines */}
        <path d={makePath('receitas')} fill="none" stroke="#10B981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={makePath('despesas')} fill="none" stroke="#EF4444" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* X axis labels */}
        {data.map((d, i) => (
          <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fill="#64748B" fontSize="11">
            {d.mes}
          </text>
        ))}

        {/* Crosshair */}
        {hover && hItem && (
          <>
            <line
              x1={hover.x} x2={hover.x}
              y1={PAD.top} y2={PAD.top + innerH}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <circle cx={hover.x} cy={yOf(hItem.receitas)} r="4" fill="#10B981" />
            <circle cx={hover.x} cy={yOf(hItem.despesas)} r="4" fill="#EF4444" />

            {/* Tooltip box */}
            {(() => {
              const tx = hover.x > W * 0.65 ? hover.x - 130 : hover.x + 10;
              return (
                <g>
                  <rect x={tx} y={PAD.top + 4} width="120" height="52" rx="7" fill="#0E1220" opacity="0.95" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <text x={tx + 10} y={PAD.top + 20} fill="#94A3B8" fontSize="10" fontWeight="600">{hItem.mes}</text>
                  <circle cx={tx + 10} cy={PAD.top + 33} r="3" fill="#10B981" />
                  <text x={tx + 17} y={PAD.top + 37} fill="#10B981" fontSize="10">R$ {(hItem.receitas / 1000).toFixed(1)}k</text>
                  <circle cx={tx + 10} cy={PAD.top + 47} r="3" fill="#EF4444" />
                  <text x={tx + 17} y={PAD.top + 51} fill="#EF4444" fontSize="10">R$ {(hItem.despesas / 1000).toFixed(1)}k</text>
                </g>
              );
            })()}
          </>
        )}
      </svg>
      <div className="flex gap-4 justify-center text-xs mt-1">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="w-3 h-[2px] bg-emerald-400 rounded inline-block" />Entradas
        </span>
        <span className="flex items-center gap-1.5 text-red-400">
          <span className="w-3 h-[2px] bg-red-400 rounded inline-block" />Saídas
        </span>
      </div>
    </div>
  );
}

// InsightCard com typewriter
interface DicaItem { id: string; tipo: 'alerta' | 'conquista' | 'dica'; titulo: string; mensagem: string }
interface AutomacaoCache {
  assinatura: string;
  ts: number;
  dicas: DicaItem[];
}

const AUTOMACAO_CACHE_KEY = 'financeiroia_dashboard_automacoes_v1';
const AUTOMACAO_TTL_MS = 4 * 60 * 60 * 1000;
function InsightCard({ dicas, onVerAssistente }: { dicas: DicaItem[]; onVerAssistente: () => void }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dica = dicas[idx % dicas.length];

  useEffect(() => {
    if (!dica) return;
    const msg = dica.mensagem;
    let i = 0;

    const iniciar = () => {
      setText('');
      setTyping(true);

      const run = () => {
        if (i <= msg.length) {
          setText(msg.slice(0, i));
          i++;
          timerRef.current = setTimeout(run, 18);
        } else {
          setTyping(false);
        }
      };

      timerRef.current = setTimeout(run, 120);
    };

    timerRef.current = setTimeout(iniciar, 0);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [idx, dica]);

  useEffect(() => {
    const iv = setInterval(() => setIdx(v => v + 1), 8000);
    return () => clearInterval(iv);
  }, []);

  if (!dica) return null;

  const indicadorCor =
    dica.tipo === 'alerta' ? '#EF4444' :
    dica.tipo === 'conquista' ? '#10B981' :
    '#7C3AED';

  const borderCor =
    dica.tipo === 'alerta' ? 'rgba(239,68,68,0.2)' :
    dica.tipo === 'conquista' ? 'rgba(16,185,129,0.2)' :
    'rgba(124,58,237,0.2)';

  return (
    <div className="glass-card p-4" style={{ borderColor: borderCor }}>
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: indicadorCor }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white mb-1">{dica.titulo}</div>
          <div className="text-slate-400 text-sm leading-relaxed min-h-[2.5rem]">
            {text}{typing && <span className="inline-block w-0.5 h-3.5 bg-slate-400 animate-pulse ml-0.5 align-text-bottom" />}
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-1">
              {dicas.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className="w-1.5 h-1.5 rounded-full transition-all"
                  style={{ background: i === idx % dicas.length ? indicadorCor : 'rgba(255,255,255,0.15)' }}
                />
              ))}
            </div>
            <button
              onClick={onVerAssistente}
              className="text-xs font-medium transition-colors flex items-center gap-1"
              style={{ color: indicadorCor }}
            >
              Ver no Assistente <ArrowRight size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// UpcomingCard
interface CartaoVenc { id: string; nome: string; dia_vencimento: number; fatura_atual: number; banco: string }
type DashboardTone = 'expense' | 'income' | 'warning' | 'neutral';

function SectionHeader({
  title,
  subtitle,
  icon,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon && <span className="flex-shrink-0 text-slate-500">{icon}</span>}
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        </div>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white sm:w-auto"
        >
          {actionLabel}
          <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
}

function DashboardMetricCard({
  title,
  value,
  subtitle,
  icon,
  tone,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: DashboardTone;
  onClick: () => void;
}) {
  const toneMap: Record<DashboardTone, { value: string; icon: string; border: string; glow: string }> = {
    expense: {
      value: 'text-red-400',
      icon: 'bg-red-500/12 text-red-400',
      border: 'rgba(239,68,68,0.16)',
      glow: 'from-red-500/12 via-transparent to-transparent',
    },
    income: {
      value: 'text-emerald-400',
      icon: 'bg-emerald-500/12 text-emerald-400',
      border: 'rgba(16,185,129,0.16)',
      glow: 'from-emerald-500/12 via-transparent to-transparent',
    },
    warning: {
      value: 'text-amber-400',
      icon: 'bg-amber-500/12 text-amber-400',
      border: 'rgba(245,158,11,0.18)',
      glow: 'from-amber-500/12 via-transparent to-transparent',
    },
    neutral: {
      value: 'text-slate-100',
      icon: 'bg-sky-500/12 text-sky-300',
      border: 'rgba(148,163,184,0.14)',
      glow: 'from-sky-500/10 via-transparent to-transparent',
    },
  };

  const palette = toneMap[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-[24px] border bg-[#0F1423]/88 p-4 text-left transition-all hover:border-white/15 hover:bg-[#12182A] active:scale-[0.985] sm:p-5"
      style={{ borderColor: palette.border }}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${palette.glow}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-slate-400">{title}</p>
          <div className={`mt-3 text-xl font-bold tabular-nums sm:text-2xl ${palette.value}`}>{value}</div>
          <p className="mt-2 text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-white/6 ${palette.icon}`}>
          {icon}
        </div>
      </div>
    </button>
  );
}

function UpcomingCard({ cartoes, onNavegar }: { cartoes: CartaoVenc[]; onNavegar: () => void }) {
  const hoje = new Date().getDate();
  const proximos = useMemo(() => {
    return cartoes
      .map(c => {
        const diasRestantes = c.dia_vencimento >= hoje
          ? c.dia_vencimento - hoje
          : 30 - hoje + c.dia_vencimento;
        return { ...c, diasRestantes };
      })
      .filter(c => c.diasRestantes <= 15)
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 5);
  }, [cartoes, hoje]);

  if (proximos.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title="Próximas faturas"
        subtitle="Top 5 cobranças mais próximas para você agir sem perder contexto."
        actionLabel="Ver cartões"
        onAction={onNavegar}
      />
      <div className="space-y-2">
        {proximos.map(c => {
          const urgente = c.diasRestantes < 5;
          return (
            <button
              key={c.id}
              type="button"
              onClick={onNavegar}
              className="w-full rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-left transition-colors hover:bg-white/[0.05]"
            >
              <div className="flex items-center gap-3">
                <BankLogo banco={c.banco as BancoSlug} size={32} className="h-8 w-8 object-contain flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{c.nome}</div>
                  <div className={`text-xs ${urgente ? 'text-red-400 font-semibold' : 'text-slate-500'}`}>
                    {urgente ? 'Urgente · ' : ''}{c.diasRestantes === 0 ? 'Vence hoje' : `Vence em ${c.diasRestantes} dia${c.diasRestantes > 1 ? 's' : ''}`}
                  </div>
                </div>
                <div className="text-sm font-bold text-red-400 tabular-nums">{formatarMoeda(c.fatura_atual)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function montarDicasLocais({
  receitas,
  despesas,
  saldo,
  graficoPizza,
  quantidadeTransacoes,
  selicAtual,
}: {
  receitas: number;
  despesas: number;
  saldo: number;
  graficoPizza: Array<{ nome: string; valor: number }>;
  quantidadeTransacoes: number;
  selicAtual: number | null;
}): DicaItem[] {
  const dicas: DicaItem[] = [];

  if (despesas > receitas * 0.9 && receitas > 0) {
    dicas.push({
      id: 'local-alerta-gastos',
      tipo: 'alerta',
      titulo: 'Gastos acima do ideal',
      mensagem: `Você usou ${((despesas / receitas) * 100).toFixed(0)}% da sua renda. O ideal é manter abaixo de 80%.`,
    });
  }

  if (saldo > 0) {
    dicas.push({
      id: 'local-saldo-positivo',
      tipo: 'conquista',
      titulo: 'Saldo positivo',
      mensagem: `Você tem ${formatarMoeda(saldo)} sobrando. ${selicAtual ? `Na Selic (${selicAtual}% a.a.), isso pode render cerca de ${formatarMoeda(saldo * selicAtual / 100 / 12)}/mês.` : 'Considere investir esse valor com segurança.'}`,
    });
  }

  if (graficoPizza.length > 0 && despesas > 0) {
    const topCat = graficoPizza[0];
    dicas.push({
      id: 'local-top-categoria',
      tipo: 'dica',
      titulo: `Maior gasto: ${topCat.nome}`,
      mensagem: `${topCat.nome} representa ${((topCat.valor / despesas) * 100).toFixed(0)}% das saídas do mês (${formatarMoeda(topCat.valor)}).`,
    });
  }

  if (quantidadeTransacoes >= 25) {
    dicas.push({
      id: 'local-volume',
      tipo: 'dica',
      titulo: 'Mês com muitos lançamentos',
      mensagem: `Você já registrou ${quantidadeTransacoes} transações neste mês. Vale revisar padrões e assinaturas recorrentes.`,
    });
  }

  return dicas.slice(0, 4);
}

function tipoDicaPorAutomacao(tipo?: string): DicaItem['tipo'] {
  if (tipo === 'alerta_orcamento' || tipo === 'revisar_cartao') return 'alerta';
  if (tipo === 'acompanhar_meta') return 'conquista';
  return 'dica';
}

function assinaturaAutomacao(snapshot: ReturnType<typeof construirSnapshotFinanceiro>) {
  return JSON.stringify({
    referencia: snapshot.referencia,
    resumoMensal: snapshot.resumoMensal,
    top: snapshot.categoriasTop.slice(0, 4),
    cartoes: snapshot.cartoes.map((cartao) => ({
      id: cartao.id,
      faturaAtual: cartao.faturaAtual,
      limite: cartao.limite,
    })),
    metas: snapshot.metas.map((meta) => ({
      id: meta.id,
      valorAtual: meta.valorAtual,
      valorAlvo: meta.valorAlvo,
    })),
    orcamentos: snapshot.orcamentos.map((orcamento) => ({
      id: orcamento.id,
      gastoAtual: orcamento.gastoAtual,
      valorLimite: orcamento.valorLimite,
    })),
  });
}

function lerCacheAutomacao(assinatura: string) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(AUTOMACAO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutomacaoCache;
    if (parsed.assinatura !== assinatura) return null;
    if (Date.now() - parsed.ts > AUTOMACAO_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function salvarCacheAutomacao(cache: AutomacaoCache) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTOMACAO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignora falhas de storage
  }
}

// Modal flutuante de detalhe dos cards resumo
type TipoModalResumo = 'gastos' | 'recebimentos' | 'pago' | 'apagar';
interface DetalheResumoData {
  LABEL_METODO: Record<string, string>;
  gastos: {
    metodos: Record<string, number>;
    porCartao: Array<{ id: string; nome: string; banco: string; valorNoMes: number }>;
    totalCartoesNoMes: number;
    semCartao: number;
    topCats: Array<{ nome: string; valor: number; cor: string; icone: string }>;
  };
  recebimentos: {
    metodos: Record<string, number>;
    porCategoria: Array<{ nome: string; icone: string; cor: string; valor: number }>;
    total: number;
    qtd: number;
  };
  pago: {
    metodos: Record<string, number>;
    porCategoria: Array<{ nome: string; icone: string; cor: string; valor: number }>;
    total: number;
  };
  apagar: {
    cartoes: Array<{ id: string; nome: string; banco: string; valor_total_fatura: number; dia_vencimento: number; diasParaVencer: number }>;
    despesasFuturas: Array<{ id: string; nome: string; icone: string; cor: string; valor: number }>;
    total: number;
  };
}

function ModalResumoCard({
  tipo, dados, onFechar, ocultar, onNavegar,
}: {
  tipo: TipoModalResumo;
  dados: DetalheResumoData;
  onFechar: () => void;
  ocultar: (v: string) => string;
  onNavegar: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onFechar]);

  const TITULO: Record<TipoModalResumo, string> = {
    gastos: 'Gastos do mês',
    recebimentos: 'Recebido',
    pago: 'Debitado do Saldo',
    apagar: 'Falta Pagar',
  };

  const COR: Record<TipoModalResumo, string> = {
    gastos: '#EF4444',
    recebimentos: '#10B981',
    pago: '#059669',
    apagar: '#F59E0B',
  };

  const cor = COR[tipo];

  function LinhaValor({ label, valor, cor: lCor, sub }: { label: string; valor: number; cor?: string; sub?: string }) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
        <div>
          <span className="text-sm text-slate-300">{label}</span>
          {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
        </div>
        <span className="text-sm font-semibold tabular-nums" style={{ color: lCor || '#F1F5F9' }}>
          {ocultar(formatarMoeda(valor))}
        </span>
      </div>
    );
  }

  function SecaoTitulo({ children }: { children: React.ReactNode }) {
    return (
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1 mt-3 first:mt-0">{children}</p>
    );
  }

  const modal = (
    <div className="fixed inset-0 z-9999 flex items-end sm:items-center justify-center" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-2xl border border-white/10 bg-[#0E1220] shadow-2xl overflow-hidden"
        style={{ borderColor: `${cor}22` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8" style={{ borderBottomColor: `${cor}22` }}>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Detalhamento</p>
            <h2 className="text-base font-bold text-white mt-0.5">{TITULO[tipo]}</h2>
          </div>
          <button
            onClick={onFechar}
            className="w-8 h-8 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-0">

          {/* ── GASTOS ── */}
          {tipo === 'gastos' && (
            <>
              {dados.gastos.porCartao.length > 0 && (
                <>
                  <SecaoTitulo>Cartões no mês</SecaoTitulo>
                  {dados.gastos.porCartao.map(c => (
                    <LinhaValor
                      key={c.id}
                      label={c.nome}
                      valor={c.valorNoMes}
                      cor="#EF4444"
                      sub="Lançamentos deste mês"
                    />
                  ))}
                  <LinhaValor label="Total no cartão" valor={dados.gastos.totalCartoesNoMes} cor="#EF4444" />
                </>
              )}

              <SecaoTitulo>Por forma de pagamento</SecaoTitulo>
              {Object.entries(dados.gastos.metodos)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([metodo, valor]) => (
                  <LinhaValor key={metodo} label={dados.LABEL_METODO[metodo] || metodo} valor={valor} />
                ))}
              {dados.gastos.semCartao > 0 && dados.gastos.porCartao.length > 0 && (
                <LinhaValor label="Despesas sem cartão" valor={dados.gastos.semCartao} />
              )}

              {dados.gastos.topCats.length > 0 && (
                <>
                  <SecaoTitulo>Top categorias</SecaoTitulo>
                  {dados.gastos.topCats.map(c => (
                    <div key={c.nome} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                      <span className="text-base">{c.icone}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-300">{c.nome}</span>
                          <span className="text-sm font-semibold tabular-nums text-slate-200">{ocultar(formatarMoeda(c.valor))}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min((c.valor / (dados.gastos.topCats[0]?.valor || 1)) * 100, 100)}%`, background: c.cor }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ── RECEBIMENTOS ── */}
          {tipo === 'recebimentos' && (
            <>
              <SecaoTitulo>Por categoria</SecaoTitulo>
              {dados.recebimentos.porCategoria.length > 0 ? dados.recebimentos.porCategoria.map(c => (
                <div key={c.nome} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                  <span className="text-base">{c.icone}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{c.nome}</span>
                      <span className="text-sm font-semibold tabular-nums text-emerald-400">{ocultar(formatarMoeda(c.valor))}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min((c.valor / (dados.recebimentos.total || 1)) * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-600 py-2">Nenhum recebimento registrado</p>
              )}

              <SecaoTitulo>Por forma de recebimento</SecaoTitulo>
              {Object.entries(dados.recebimentos.metodos)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([metodo, valor]) => (
                  <LinhaValor key={metodo} label={dados.LABEL_METODO[metodo] || metodo} valor={valor} cor="#10B981" />
                ))}
              {Object.keys(dados.recebimentos.metodos).length === 0 && (
                <p className="text-sm text-slate-600 py-2">Sem dados de forma de recebimento</p>
              )}

              <div className="mt-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15 p-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">{dados.recebimentos.qtd} entrada{dados.recebimentos.qtd !== 1 ? 's' : ''} no período</span>
                <span className="text-sm font-bold text-emerald-400 tabular-nums">{ocultar(formatarMoeda(dados.recebimentos.total))}</span>
              </div>
            </>
          )}

          {/* ── TOTAL PAGO ── */}
          {tipo === 'pago' && (
            <>
              {dados.pago.porCategoria.length > 0 && (
                <>
                  <SecaoTitulo>Por categoria</SecaoTitulo>
                  {dados.pago.porCategoria.map(c => (
                    <div key={c.nome} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                      <span className="text-base">{c.icone}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-300">{c.nome}</span>
                          <span className="text-sm font-semibold tabular-nums text-slate-200">{ocultar(formatarMoeda(c.valor))}</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min((c.valor / (dados.pago.total || 1)) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <SecaoTitulo>Por forma de pagamento</SecaoTitulo>
              {Object.entries(dados.pago.metodos)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([metodo, valor]) => (
                  <LinhaValor key={metodo} label={dados.LABEL_METODO[metodo] || metodo} valor={valor} cor="#059669" />
                ))}
              {Object.keys(dados.pago.metodos).length === 0 && (
                <p className="text-sm text-slate-600 py-2">Nenhuma saída debitada do saldo até o momento</p>
              )}

              <div className="mt-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15 p-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">Total debitado do saldo até hoje</span>
                <span className="text-sm font-bold text-emerald-500 tabular-nums">{ocultar(formatarMoeda(dados.pago.total))}</span>
              </div>
            </>
          )}

          {/* ── FALTA PAGAR ── */}
          {tipo === 'apagar' && (
            <>
              {dados.apagar.cartoes.length > 0 && (
                <>
                  <SecaoTitulo>Faturas pendentes dos cartões</SecaoTitulo>
                  {dados.apagar.cartoes.map(c => (
                    <LinhaValor
                      key={c.id}
                      label={c.nome}
                      valor={c.valor_total_fatura}
                      cor={c.diasParaVencer <= 5 ? '#EF4444' : '#F59E0B'}
                      sub={c.diasParaVencer === 0 ? 'Vence hoje!' : `Vence em ${c.diasParaVencer} dia${c.diasParaVencer > 1 ? 's' : ''} · dia ${c.dia_vencimento}`}
                    />
                  ))}
                </>
              )}

              {dados.apagar.despesasFuturas.length > 0 && (
                <>
                  <SecaoTitulo>Despesas previstas no mês</SecaoTitulo>
                  {dados.apagar.despesasFuturas.map(c => (
                    <div key={c.id} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                      <span className="text-base">{c.icone}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-300">{c.nome}</span>
                          <span className="text-sm font-semibold tabular-nums text-amber-400">{ocultar(formatarMoeda(c.valor))}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {dados.apagar.cartoes.length === 0 && dados.apagar.despesasFuturas.length === 0 && (
                <p className="text-sm text-slate-600 py-4 text-center">Nenhum pagamento pendente identificado</p>
              )}

              <div className="mt-3 rounded-xl bg-amber-500/8 border border-amber-500/15 p-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">Total a pagar</span>
                <span className="text-sm font-bold text-amber-400 tabular-nums">{ocultar(formatarMoeda(dados.apagar.total))}</span>
              </div>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-5 pb-5 pt-3 border-t border-white/8">
          <button
            onClick={() => { onNavegar(); onFechar(); }}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
            style={{ background: `${cor}18`, color: cor, border: `1px solid ${cor}30` }}
          >
            Ver transações detalhadas <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

// Score Widget
function ScoreWidget({ score, onNavegar }: { score: ScoreFinanceiro; onNavegar: () => void }) {
  const corScore =
    score.total >= 80 ? '#10B981' :
    score.total >= 60 ? '#3B82F6' :
    score.total >= 40 ? '#F59E0B' : '#EF4444';

  const labelNivel =
    score.nivel === 'otimo' ? 'Ótimo' :
    score.nivel === 'bom' ? 'Bom' :
    score.nivel === 'atencao' ? 'Atenção' : 'Crítico';

  return (
    <button
      type="button"
      onClick={onNavegar}
      className="glass-card p-4 w-full text-left"
      style={{ borderColor: `${corScore}33` }}
    >
      <div className="flex items-center gap-4">
        {/* Score circle */}
        <div className="flex-shrink-0 text-center">
          <div className="text-3xl font-black tabular-nums" style={{ color: corScore }}>
            {score.total}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: corScore }}>
            {labelNivel}
          </div>
        </div>

        {/* Middle: label + bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-300">Score de Saúde Financeira</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${score.total}%`, background: corScore }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-slate-600">0</span>
            <span className="text-[10px] text-slate-600">100</span>
          </div>
        </div>

        {/* CTA */}
        <div
          className="flex-shrink-0 flex items-center gap-1 text-xs font-medium transition-colors"
          style={{ color: corScore }}
        >
          Detalhes <ArrowRight size={11} />
        </div>
      </div>
    </button>
  );
}

interface RespostaIAArquivo {
  tipo: 'transacao' | 'lote' | 'conversa';
  resposta: string;
  transacao?: TransacaoExtraida;
  transacoes?: TransacaoExtraida[];
  totalValor?: number;
}

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
    alimentacao: ['alimentacao', 'almoço', 'almoco', 'restaurante'],
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
    beleza: ['beleza', 'salão', 'salao'],
    presentes: ['presentes', 'presente'],
    farmacia: ['farmacia', 'drogaria'],
    delivery: ['delivery', 'ifood', 'rappi'],
    salario: ['salario'],
    freelance: ['freelance'],
    rendimentos: ['rendimentos', 'investimento'],
    outros: ['outros'],
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

function diasAte(dia: number) {
  const hoje = new Date().getDate();
  return dia >= hoje ? dia - hoje : 30 - hoje + dia;
}

function aplicarDataDeExibicaoNaTransacao(transacao: Transacao, dataExibicao: string): Transacao {
  if (transacao.tipo !== 'despesa') return transacao;
  return {
    ...transacao,
    data: dataExibicao,
    data_cobranca: dataExibicao,
  };
}

function getDataExibicaoNoMes(
  transacao: Transacao,
  cartoes: CartaoCredito[],
  mes: number,
  ano: number,
) {
  const cartao = transacao.cartao_id ? cartoes.find((item) => item.id === transacao.cartao_id) : undefined;
  const dataCompetencia = getDataCompetenciaDespesa(transacao, cartao);
  const transacaoNaCompetencia = aplicarDataDeExibicaoNaTransacao(transacao, dataCompetencia);

  if (transacao.tipo === 'despesa' && transacao.classificacao !== 'fixa' && (transacao.parcelas || 1) <= 1) {
    const [faturaAno, faturaMes] = dataCompetencia.split('-').map(Number);
    return faturaMes === mes && faturaAno === ano ? dataCompetencia : null;
  }

  const ocorrencia = getDataOcorrenciaNoMes(
    transacao.tipo === 'despesa' ? transacaoNaCompetencia : transacao,
    mes,
    ano,
  );

  return ocorrencia ? formatFinancialDate(ocorrencia) : null;
}

// ─── Modal Conta Bancária ────────────────────────────────────────────────────
function ModalContaBancaria({
  conta, lista, categorias, cartoes: todosCartoes, ocultar, mes, ano, hoje, onFechar, onTransacao,
}: {
  conta: ContaBancaria;
  lista: Transacao[];
  categorias: Categoria[];
  cartoes: CartaoCredito[];
  ocultar: (v: string) => string;
  mes: number;
  ano: number;
  hoje: Date;
  onFechar: () => void;
  onTransacao: (t: Transacao) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onFechar]);

  const info = BANCO_INFO[conta.banco] || BANCO_INFO.outro;
  const ordenada = ordenarTransacoesPorDataDesc(lista);
  const entradasMes = lista
    .filter((t) => t.tipo === 'receita' && transacaoContaNoMesAteData(t, mes, ano, hoje))
    .reduce((s, t) => s + t.valor, 0);
  const saidasMes = lista
    .filter((t) => (t.tipo === 'despesa' || t.tipo === 'transferencia') && transacaoContaNoMesAteData(t, mes, ano, hoje))
    .reduce((s, t) => s + t.valor, 0);

  const modal = (
    <div className="fixed inset-0 z-9999 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl lg:rounded-2xl border border-slate-700 bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-3">
            <BankLogo banco={conta.banco} size={36} className="h-9 w-9 object-contain" />
            <div>
              <h3 className="text-lg font-bold text-white">{info.nome}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{conta.nome} • {conta.tipo}</p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="rounded-lg p-1.5 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Saldo atual</div>
              <div className="mt-1 text-base font-bold text-white tabular-nums">{ocultar(formatarMoeda(conta.saldo))}</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-3">
              <div className="text-[11px] text-slate-500">Entradas no mês</div>
              <div className="mt-1 text-sm font-semibold text-emerald-400 tabular-nums">{ocultar(formatarMoeda(entradasMes))}</div>
            </div>
            <div className="rounded-2xl border border-red-500/15 bg-red-500/5 p-3">
              <div className="text-[11px] text-slate-500">Saídas no mês</div>
              <div className="mt-1 text-sm font-semibold text-red-400 tabular-nums">{ocultar(formatarMoeda(saidasMes))}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Tipo de conta</div>
              <div className="mt-1 text-sm font-semibold text-white capitalize">{conta.tipo}</div>
            </div>
            {conta.saldo_base != null && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] text-slate-500">Saldo inicial</div>
                <div className="mt-1 text-sm font-semibold text-white tabular-nums">{ocultar(formatarMoeda(conta.saldo_base))}</div>
              </div>
            )}
            {conta.agencia && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] text-slate-500">Agência</div>
                <div className="mt-1 text-sm font-semibold text-white">{conta.agencia}</div>
              </div>
            )}
            {conta.conta && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] text-slate-500">Número da conta</div>
                <div className="mt-1 text-sm font-semibold text-white">{conta.conta}</div>
              </div>
            )}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Cadastrada em</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {parseFinancialDate(conta.criado_em).toLocaleDateString('pt-BR')}
              </div>
            </div>
            {conta.atualizado_em && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] text-slate-500">Última atualização</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {parseFinancialDate(conta.atualizado_em).toLocaleDateString('pt-BR')}
                </div>
              </div>
            )}
          </div>
          {conta.pluggy_item_id && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3">
              <div className="text-[11px] text-blue-400 font-semibold uppercase tracking-wide mb-2">Open Finance</div>
              {conta.pluggy_sync_em && (
                <div>
                  <div className="text-[11px] text-slate-500">Última sincronização</div>
                  <div className="mt-0.5 text-sm text-white">{new Date(conta.pluggy_sync_em).toLocaleString('pt-BR')}</div>
                </div>
              )}
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Todos os lançamentos</span>
              <span className="text-[11px] text-slate-600">{ordenada.length} lançamentos</span>
            </div>
            <div className="space-y-2">
              {ordenada.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-600">
                  Nenhuma movimentação vinculada a essa conta ainda.
                </div>
              ) : ordenada.map((t) => {
                const cat = categorias.find((c) => c.id === t.categoria_id);
                const cartao = todosCartoes.find((c) => c.id === t.cartao_id);
                const dataLista = t.cartao_id ? getDataCobrancaCartao(t, cartao) : t.data;
                return (
                  <button key={t.id} type="button" onClick={() => onTransacao(t)}
                    className="w-full rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.05] transition-colors">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                      style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)', color: cat?.cor || '#94A3B8' }}>
                      {cat?.icone || '??'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{t.descricao}</div>
                      <div className="text-[11px] text-slate-500">
                        {cat?.nome || 'Outros'} • {parseFinancialDate(dataLista).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold tabular-nums flex-shrink-0 ${t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.tipo === 'receita' ? '+' : '-'}{ocultar(formatarMoeda(t.valor))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

// ─── Modal Cartão de Crédito ─────────────────────────────────────────────────
function ModalCartaoCredito({
  cartao, lista, categorias, ocultar, statusImportacao, cartaoImportandoId,
  configOcr, onImportar, onAtualizarOcr, onFechar, onTransacao,
}: {
  cartao: CartaoCredito;
  lista: Transacao[];
  categorias: Categoria[];
  ocultar: (v: string) => string;
  statusImportacao: { cartaoId: string; tipo: 'sucesso' | 'erro' | 'info'; mensagem: string } | null;
  cartaoImportandoId: string | null;
  configOcr: AIModelId;
  onImportar: () => void;
  onAtualizarOcr: (v: AIModelId) => void;
  onFechar: () => void;
  onTransacao: (t: Transacao) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onFechar]);

  const info = BANCO_INFO[cartao.banco] || BANCO_INFO.outro;
  const ordenada = ordenarTransacoesPorDataDesc(lista);
  const compras = lista.filter((t) => t.tipo === 'despesa');
  const estornos = lista.filter((t) => t.tipo === 'receita');
  const totalCompras = compras.reduce((s, t) => s + t.valor, 0);
  const totalEstornos = estornos.reduce((s, t) => s + t.valor, 0);
  const maiorCompra = compras.reduce((m, t) => Math.max(m, t.valor), 0);
  const ticketMedio = compras.length > 0 ? totalCompras / compras.length : 0;
  const limiteDisponivel = cartao.limite - cartao.fatura_atual;
  const usoLimite = cartao.limite > 0 ? (cartao.fatura_atual / cartao.limite) * 100 : 0;
  const statusAtual = statusImportacao?.cartaoId === cartao.id ? statusImportacao : null;
  const importando = cartaoImportandoId === cartao.id;

  const modal = (
    <div className="fixed inset-0 z-9999 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl lg:rounded-2xl border border-slate-700 bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <BankLogo banco={cartao.banco} size={36} className="h-9 w-9 object-contain" />
              <CardBrandLogo banco={cartao.banco} nomeCartao={cartao.nome} bandeira={cartao.bandeira} size={18} className="absolute -bottom-1 -right-1 h-[18px] w-[18px] object-contain shadow-sm" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{cartao.nome}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{info.nome} • {cartao.bandeira}</p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="rounded-lg p-1.5 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-red-500/15 bg-red-500/5 p-3">
              <div className="text-[11px] text-slate-500">Fatura atual</div>
              <div className="mt-1 text-sm font-bold text-red-400 tabular-nums">{ocultar(formatarMoeda(cartao.fatura_atual))}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Limite total</div>
              <div className="mt-1 text-sm font-semibold text-white tabular-nums">{ocultar(formatarMoeda(cartao.limite))}</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-3">
              <div className="text-[11px] text-slate-500">Disponível</div>
              <div className="mt-1 text-sm font-semibold text-emerald-400 tabular-nums">{ocultar(formatarMoeda(limiteDisponivel))}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Fecha / Vence</div>
              <div className="mt-1 text-sm font-semibold text-white">Dia {cartao.dia_fechamento} / {cartao.dia_vencimento}</div>
            </div>
          </div>
          {cartao.limite > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-slate-500">Uso do limite</span>
                <span className={`text-xs font-bold tabular-nums ${usoLimite >= 90 ? 'text-red-400' : usoLimite >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {usoLimite.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(usoLimite, 100)}%`, background: usoLimite >= 90 ? '#EF4444' : usoLimite >= 70 ? '#F59E0B' : '#10B981' }} />
              </div>
              <div className="mt-1.5 text-[10px] text-slate-600">
                Vencimento em {diasAte(cartao.dia_vencimento)} dia(s)
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Compras no app</div>
              <div className="mt-1 text-sm font-semibold text-white">{compras.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Ticket médio</div>
              <div className="mt-1 text-sm font-semibold text-white tabular-nums">{ocultar(formatarMoeda(ticketMedio))}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Maior compra</div>
              <div className="mt-1 text-sm font-semibold text-white tabular-nums">{ocultar(formatarMoeda(maiorCompra))}</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-3">
              <div className="text-[11px] text-slate-500">Estornos / créditos</div>
              <div className="mt-1 text-sm font-semibold text-emerald-400 tabular-nums">{ocultar(formatarMoeda(totalEstornos))}</div>
            </div>
          </div>
          {cartao.fatura_ajuste_manual != null && cartao.fatura_ajuste_manual !== 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="text-[11px] text-amber-400">Fatura com ajuste manual</div>
              <div className="mt-1 text-sm font-semibold text-white tabular-nums">{ocultar(formatarMoeda(cartao.fatura_ajuste_manual))}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Cadastrado em</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {parseFinancialDate(cartao.criado_em).toLocaleDateString('pt-BR')}
              </div>
            </div>
            {cartao.atualizado_em && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] text-slate-500">Última atualização</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {parseFinancialDate(cartao.atualizado_em).toLocaleDateString('pt-BR')}
                </div>
              </div>
            )}
          </div>
          {cartao.pluggy_item_id && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3">
              <div className="text-[11px] text-blue-400 font-semibold uppercase tracking-wide mb-2">Open Finance</div>
              {cartao.pluggy_sync_em && (
                <div>
                  <div className="text-[11px] text-slate-500">Última sincronização</div>
                  <div className="mt-0.5 text-sm text-white">{new Date(cartao.pluggy_sync_em).toLocaleString('pt-BR')}</div>
                </div>
              )}
            </div>
          )}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[11px] text-slate-500 mb-3">Importar fatura</div>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[200px]">
                <OCRModelSelect value={configOcr} onChange={onAtualizarOcr} compact />
              </div>
              <button type="button" onClick={onImportar}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-purple-600/15 border border-purple-500/25 text-purple-300 hover:bg-purple-600/25 transition-all flex items-center gap-1.5">
                {importando ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                I.A
              </button>
              <button type="button" onClick={onImportar}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] transition-all flex items-center gap-1.5">
                <FileText size={14} />
                PDF
              </button>
              <button type="button" onClick={onImportar}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] transition-all flex items-center gap-1.5">
                <ImageIcon size={14} />
                Imagem
              </button>
            </div>
            {statusAtual && (
              <div className={`mt-3 rounded-2xl px-3 py-2 text-xs border ${
                statusAtual.tipo === 'sucesso' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : statusAtual.tipo === 'erro' ? 'bg-red-500/10 border-red-500/20 text-red-300'
                  : 'bg-purple-500/10 border-purple-500/20 text-purple-300'
              }`}>
                {statusAtual.mensagem}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Compras lançadas</span>
              <span className="text-[11px] text-slate-600">{ordenada.length} lançamentos</span>
            </div>
            <div className="space-y-2">
              {ordenada.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-600">
                  Nenhuma compra vinculada a esse cartão ainda.
                </div>
              ) : ordenada.map((t) => {
                const cat = categorias.find((c) => c.id === t.categoria_id);
                const dataLista = getDataCobrancaCartao(t, cartao);
                return (
                  <button key={t.id} type="button" onClick={() => onTransacao(t)}
                    className="w-full rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.05] transition-colors">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                      style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)', color: cat?.cor || '#94A3B8' }}>
                      {cat?.icone || '??'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{t.descricao}</div>
                      <div className="text-[11px] text-slate-500">
                        {cat?.nome || 'Outros'} • {parseFinancialDate(dataLista).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold tabular-nums flex-shrink-0 ${t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.tipo === 'receita' ? '+' : '-'}{ocultar(formatarMoeda(t.valor))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

export default function Dashboard({ onNovoPagina }: Props) {
  const {
    transacoes, categorias, contas, cartoes, orcamentos, metas, dicasIA, setDicasIA, selicAtual,
    config, atualizarConfig,
    adicionarTransacao,
  } = useFinanceiroStore();
  const { mes, ano } = mesAtual();
  const [saldoOculto, setSaldoOculto] = useState(false);
  const [catFiltro, setCatFiltro] = useState<string | null>(null);
  const [contaModalId, setContaModalId] = useState<string | null>(null);
  const [cartaoModalId, setCartaoModalId] = useState<string | null>(null);
  const [cartaoImportandoId, setCartaoImportandoId] = useState<string | null>(null);
  const [statusImportacao, setStatusImportacao] = useState<{ cartaoId: string; tipo: 'sucesso' | 'erro' | 'info'; mensagem: string } | null>(null);
  const [carregandoAutomacoes, setCarregandoAutomacoes] = useState(false);
  const [transacaoEditando, setTransacaoEditando] = useState<Transacao | undefined>();
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [transacaoDetalhe, setTransacaoDetalhe] = useState<Transacao | null>(null);
  const [modalResumo, setModalResumo] = useState<'gastos' | 'recebimentos' | 'pago' | 'apagar' | null>(null);
  const arquivoCartaoRef = useRef<HTMLInputElement>(null);
  const hoje = startOfTodayLocal();

  const dadosMes = useMemo(() => {
    const referenciaHoje = startOfTodayLocal();
    const despesasLancadas = transacoes.filter((transacao) => (
      transacao.tipo === 'despesa' && isSameFinancialMonth(transacao.data, mes, ano)
    ));
    const registrosMes = transacoes.flatMap((transacao) => {
      const dataExibicao = getDataExibicaoNoMes(transacao, cartoes, mes, ano);
      if (!dataExibicao) return [];

      const transacaoNaCompetencia = aplicarDataDeExibicaoNaTransacao(transacao, dataExibicao);
      const realizada = transacaoContaNoMesAteData(
        transacao.tipo === 'despesa' ? transacaoNaCompetencia : transacao,
        mes,
        ano,
        referenciaHoje,
      );

      return [{ transacao, dataExibicao, realizada }];
    });

    const doMes = ordenarTransacoesPorDataDesc(registrosMes.map(({ transacao, dataExibicao }) => (
      transacao.tipo === 'despesa'
        ? aplicarDataDeExibicaoNaTransacao(transacao, dataExibicao)
        : { ...transacao, data: dataExibicao }
    )));
    const doMesAteHoje = doMes.filter((transacao) => transacaoContaNoMesAteData(transacao, mes, ano, referenciaHoje));
    const receitas = doMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const despesas = despesasLancadas.reduce((s, t) => s + t.valor, 0);
    const saldo = receitas - despesas;

    const porCat: Record<string, { valor: number; cor: string; icone: string }> = {};
    doMes.filter(t => t.tipo === 'despesa').forEach(t => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      const nome = cat?.nome || 'Outros';
      if (!porCat[nome]) porCat[nome] = { valor: 0, cor: cat?.cor || '#6B7280', icone: cat?.icone || '??' };
      porCat[nome].valor += t.valor;
    });

    const graficoPizza = Object.entries(porCat)
      .sort(([, a], [, b]) => b.valor - a.valor)
      .slice(0, 6)
      .map(([nome, info], i) => ({ nome, valor: info.valor, cor: info.cor || CORES[i % CORES.length], icone: info.icone }));

    const areaData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
      const m = d.getMonth() + 1; const a = d.getFullYear();
      const filtrado = transacoes.flatMap((transacao) => {
        const dataExibicao = getDataExibicaoNoMes(transacao, cartoes, m, a);
        if (!dataExibicao) return [];

        return [transacao.tipo === 'despesa'
          ? aplicarDataDeExibicaoNaTransacao(transacao, dataExibicao)
          : { ...transacao, data: dataExibicao }];
      });
      return {
        mes: MESES_ABREV[m - 1],
        receitas: filtrado.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0),
        despesas: filtrado.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0),
      };
    });

    return { receitas, despesas, saldo, graficoPizza, areaData, doMes, doMesAteHoje, registrosMes, despesasLancadas };
  }, [transacoes, categorias, cartoes, mes, ano]);

  // Despesas que ainda não ocorreram neste mês = "A pagar"
  const aPagarMesAtual = useMemo(() => {
    const totalFaturas = cartoes.reduce((total, cartao) => total + cartao.fatura_atual, 0);
    const despesasExtrasPendentes = dadosMes.registrosMes.reduce((total, registro) => (
      registro.transacao.tipo === 'despesa' && !registro.realizada && !registro.transacao.cartao_id
        ? total + registro.transacao.valor
        : total
    ), 0);

    return totalFaturas + despesasExtrasPendentes;
  }, [cartoes, dadosMes]);

  const snapshotProjeto = useMemo(() => construirSnapshotFinanceiro({
    transacoes,
    categorias,
    contas,
    cartoes,
    metas,
    orcamentos,
  }), [transacoes, categorias, contas, cartoes, metas, orcamentos]);

  const dicasLocais = useMemo(() => montarDicasLocais({
    receitas: dadosMes.receitas,
    despesas: dadosMes.despesas,
    saldo: dadosMes.saldo,
    graficoPizza: dadosMes.graficoPizza,
    quantidadeTransacoes: dadosMes.doMes.length,
    selicAtual,
  }), [dadosMes, selicAtual]);

  useEffect(() => {
    const criadoEm = new Date().toISOString();
    setDicasIA(dicasLocais.map((dica) => ({ ...dica, origem: 'local' as const, criado_em: criadoEm })));
  }, [dicasLocais, setDicasIA]);

  useEffect(() => {
    const assinatura = assinaturaAutomacao(snapshotProjeto);
    const cache = lerCacheAutomacao(assinatura);
    if (cache) {
      setDicasIA([
        ...dicasLocais.map((dica) => ({ ...dica, origem: 'local' as const, criado_em: new Date(cache.ts).toISOString() })),
        ...cache.dicas.map((dica) => ({ ...dica, origem: 'automacao' as const, criado_em: new Date(cache.ts).toISOString() })),
      ]);
      return;
    }

    setDicasIA(dicasLocais.map((dica) => ({ ...dica, origem: 'local' as const, criado_em: new Date().toISOString() })));
    return;

    let ativo = true;
    const timeout = setTimeout(async () => {
      setCarregandoAutomacoes(true);
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: 'automacao_financeira_interna',
            provider: config.ai_modelo_padrao || 'automatico',
            mode: (config.ai_modelo_padrao || 'automatico') !== 'automatico' ? 'manual' : 'auto',
            input: {
              question: 'Analise o projeto e sugira automacoes, monitoramentos e alertas importantes.',
              projectSnapshot: snapshotProjeto,
            },
          }),
        });

        if (!ativo || !res.ok) return;
        const data = await res.json() as {
          acoes_sugeridas?: Array<{ tipo?: string; titulo?: string; descricao?: string }>;
          automacoes_prontas?: Array<{ descricao?: string }>;
        };

        const automacoes: DicaItem[] = [
          ...(data.acoes_sugeridas || []).map((acao, index): DicaItem => ({
            id: `auto-acao-${index}`,
            tipo: tipoDicaPorAutomacao(acao.tipo),
            titulo: acao.titulo || 'Ação sugerida',
            mensagem: acao.descricao || '',
          })),
          ...(data.automacoes_prontas || []).map((automacao, index): DicaItem => ({
            id: `auto-rotina-${index}`,
            tipo: 'dica',
            titulo: 'Automação pronta',
            mensagem: automacao.descricao || '',
          })),
        ].filter((dica) => dica.mensagem);

        if (!ativo || automacoes.length === 0) return;

        salvarCacheAutomacao({
          assinatura,
          ts: Date.now(),
          dicas: automacoes,
        });

        setDicasIA([
          ...dicasLocais.map((dica) => ({ ...dica, origem: 'local' as const, criado_em: new Date().toISOString() })),
          ...automacoes.map((dica) => ({ ...dica, origem: 'automacao' as const, criado_em: new Date().toISOString() })),
        ]);
      } catch {
        // Mantem as dicas locais se a IA falhar.
      } finally {
        if (ativo) setCarregandoAutomacoes(false);
      }
    }, 900);

    return () => {
      ativo = false;
      clearTimeout(timeout);
    };
  }, [config.ai_modelo_padrao, dicasLocais, setDicasIA, snapshotProjeto]);

  // Score de saúde financeira
  async function atualizarAnaliseIA() {
    if (snapshotProjeto.transacoesRecentes.length === 0 && snapshotProjeto.cartoes.length === 0) return;

    const assinatura = assinaturaAutomacao(snapshotProjeto);
    setCarregandoAutomacoes(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'automacao_financeira_interna',
          provider: config.ai_modelo_padrao || 'automatico',
          mode: (config.ai_modelo_padrao || 'automatico') !== 'automatico' ? 'manual' : 'auto',
          input: {
            question: 'Analise o projeto e sugira automacoes, monitoramentos e alertas importantes.',
            projectSnapshot: snapshotProjeto,
          },
        }),
      });

      if (!res.ok) return;
      const data = await res.json() as {
        acoes_sugeridas?: Array<{ tipo?: string; titulo?: string; descricao?: string }>;
        automacoes_prontas?: Array<{ descricao?: string }>;
      };

      const automacoes: DicaItem[] = [
        ...(data.acoes_sugeridas || []).map((acao, index): DicaItem => ({
          id: `auto-acao-${index}`,
          tipo: tipoDicaPorAutomacao(acao.tipo),
          titulo: acao.titulo || 'Ação sugerida',
          mensagem: acao.descricao || '',
        })),
        ...(data.automacoes_prontas || []).map((automacao, index): DicaItem => ({
          id: `auto-rotina-${index}`,
          tipo: 'dica',
          titulo: 'Automação pronta',
          mensagem: automacao.descricao || '',
        })),
      ].filter((dica) => dica.mensagem);

      if (automacoes.length === 0) return;

      salvarCacheAutomacao({
        assinatura,
        ts: Date.now(),
        dicas: automacoes,
      });

      setDicasIA([
        ...dicasLocais.map((dica) => ({ ...dica, origem: 'local' as const, criado_em: new Date().toISOString() })),
        ...automacoes.map((dica) => ({ ...dica, origem: 'automacao' as const, criado_em: new Date().toISOString() })),
      ]);
    } catch {
      // Mantem as dicas locais se a IA falhar.
    } finally {
      setCarregandoAutomacoes(false);
    }
  }

  const score = useMemo(
    () => calcularScore({ transacoes, orcamentos, contas, cartoes, metas }),
    [transacoes, orcamentos, contas, cartoes, metas],
  );

  // Previsão - próximos 7 dias
  const proximosGastos = useMemo(
    () => calcularPrevisao(transacoes, 7),
    [transacoes],
  );

  // useCountUp para valores animados
  // Saldo real = dinheiro em conta − o que ainda precisa ser pago
  const saldoContas = contas.reduce((s, c) => s + c.saldo, 0);
  const saldoProjetado = saldoContas - aPagarMesAtual;
  const gastosFixos = useMemo(() => {
    const ref = startOfTodayLocal();
    const doMes = transacoes.filter(t =>
      t.tipo === 'despesa' &&
      transacaoContaNoMesAteData(t, mes, ano, ref),
    );
    const fixos = doMes.filter(t => t.classificacao === 'fixa');
    const parcelados = doMes.filter(t =>
      t.classificacao !== 'fixa' &&
      t.parcelas && t.parcelas > 1,
    );
    // deduplicar por id (parcelado pode ter classificacao fixa também)
    const ids = new Set(fixos.map(t => t.id));
    const parceladosSemDup = parcelados.filter(t => !ids.has(t.id));
    return { fixos, parcelados: parceladosSemDup };
  }, [transacoes, mes, ano]);

  const detalheResumo = useMemo(() => {
    const ref = startOfTodayLocal();
    const despesasMes = dadosMes.despesasLancadas;
    const receitasMes = dadosMes.doMes.filter(t => t.tipo === 'receita');

    const somarPorMetodo = (lista: typeof despesasMes) => {
      const m: Record<string, number> = {};
      lista.forEach(t => {
        const k = t.metodo_pagamento || 'outro';
        m[k] = (m[k] || 0) + t.valor;
      });
      return m;
    };

    const LABEL_METODO: Record<string, string> = {
      pix: 'PIX',
      debito: 'Débito',
      credito: 'Crédito',
      dinheiro: 'Dinheiro',
      transferencia: 'Transferência',
      emprestimo: 'Empréstimo',
      financiamento: 'Financiamento',
      outro: 'Outro',
    };

    // ── GASTOS ───────────────────────────────────────────────
    const metodosGastos = somarPorMetodo(despesasMes);
    const porCartaoLancado = cartoes.map(c => ({
      id: c.id,
      nome: c.nome,
      banco: c.banco,
      valorNoMes: despesasMes
        .filter(t => t.cartao_id === c.id)
        .reduce((s, t) => s + t.valor, 0),
    })).filter(c => c.valorNoMes > 0);

    const totalCartoesNoMes = porCartaoLancado.reduce((s, c) => s + c.valorNoMes, 0);
    const gastosSemCartao = despesasMes.filter(t => !t.cartao_id).reduce((s, t) => s + t.valor, 0);
    const topCatsGastos = despesasMes.reduce<Array<{ nome: string; valor: number; cor: string; icone: string }>>((acc, t) => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      const nome = cat?.nome || 'Outros';
      const existente = acc.find((item) => item.nome === nome);
      if (existente) {
        existente.valor += t.valor;
      } else {
        acc.push({ nome, valor: t.valor, cor: cat?.cor || '#6B7280', icone: cat?.icone || '??' });
      }
      return acc;
    }, []).sort((a, b) => b.valor - a.valor).slice(0, 5);

    // ── RECEBIMENTOS ──────────────────────────────────────────
    const metodosReceitas = somarPorMetodo(receitasMes);
    const receitasPorCategoria = receitasMes.reduce<Array<{ nome: string; icone: string; cor: string; valor: number }>>((acc, t) => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      const nome = cat?.nome || 'Outros';
      const ex = acc.find(a => a.nome === nome);
      if (ex) { ex.valor += t.valor; }
      else acc.push({ nome, icone: cat?.icone || '??', cor: cat?.cor || '#6B7280', valor: t.valor });
      return acc;
    }, []).sort((a, b) => b.valor - a.valor);

    // ── PAGO ─────────────────────────────────────────────────
    const despesasDebitadasSaldo = despesasMes.filter(t => {
      if (t.cartao_id) return false;
      const ocorrencia = getDataOcorrenciaNoMes(t, mes, ano);
      return ocorrencia !== null
        && ocorrencia <= ref
        && (!t.metodo_pagamento || METODOS_DEBITO.has(t.metodo_pagamento));
    });
    const metodosPagos = somarPorMetodo(despesasDebitadasSaldo);
    const totalPagoCalc = despesasDebitadasSaldo.reduce((s, t) => s + t.valor, 0);
    const catsPagas = despesasDebitadasSaldo.reduce<Array<{ nome: string; icone: string; cor: string; valor: number }>>((acc, t) => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      const nome = cat?.nome || 'Outros';
      const ex = acc.find(a => a.nome === nome);
      if (ex) { ex.valor += t.valor; }
      else acc.push({ nome, icone: cat?.icone || '??', cor: cat?.cor || '#6B7280', valor: t.valor });
      return acc;
    }, []).sort((a, b) => b.valor - a.valor).slice(0, 5);

    // ── A PAGAR ───────────────────────────────────────────────
    const despesasFuturasExtras = despesasMes.filter(t => {
      if (t.cartao_id) return false;
      const ocorrencia = getDataOcorrenciaNoMes(t, mes, ano);
      return ocorrencia !== null && ocorrencia > ref;
    }).map((t) => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      return {
        id: t.id,
        nome: t.descricao,
        icone: cat?.icone || '??',
        cor: cat?.cor || '#6B7280',
        valor: t.valor,
      };
    }).sort((a, b) => b.valor - a.valor);

    const cartoesPendentes = cartoes.map(c => {
      const hoje = ref;
      const vencimento = new Date(hoje.getFullYear(), hoje.getMonth(), c.dia_vencimento);
      if (vencimento <= hoje) vencimento.setMonth(vencimento.getMonth() + 1);
      const dias = Math.ceil((vencimento.getTime() - hoje.getTime()) / 86400000);
      return {
        id: c.id,
        nome: c.nome,
        banco: c.banco,
        dia_vencimento: c.dia_vencimento,
        diasParaVencer: dias,
        valor_total_fatura: c.fatura_atual,
      };
    }).filter(c => c.valor_total_fatura > 0).sort((a, b) => a.diasParaVencer - b.diasParaVencer);

    return {
      LABEL_METODO,
      gastos: { metodos: metodosGastos, porCartao: porCartaoLancado, totalCartoesNoMes, semCartao: gastosSemCartao, topCats: topCatsGastos },
      recebimentos: { metodos: metodosReceitas, porCategoria: receitasPorCategoria, total: dadosMes.receitas, qtd: receitasMes.length },
      pago: { metodos: metodosPagos, porCategoria: catsPagas, total: totalPagoCalc },
      apagar: { cartoes: cartoesPendentes, despesasFuturas: despesasFuturasExtras, total: aPagarMesAtual },
    };
  }, [dadosMes, cartoes, categorias, aPagarMesAtual, mes, ano, transacoes]);

  const receitasAnimado = useCountUp(dadosMes.receitas);
  const despesasAnimado = useCountUp(dadosMes.despesas);
  const saldoMesAnimado = useCountUp(saldoProjetado);
  const totalPagoAnimado = useCountUp(detalheResumo.pago.total);
  const aPagarAnimado = useCountUp(aPagarMesAtual);
  const corSaldoMes =
    saldoProjetado > 0 ? '#10B981' :
    saldoProjetado < 0 ? '#EF4444' :
    '#F1F5F9';
  const totalFaturaAtual = useMemo(
    () => cartoes.reduce((soma, cartao) => soma + cartao.fatura_atual, 0),
    [cartoes],
  );
  const proximoVencimento = useMemo(() => {
    const hoje = new Date().getDate();
    const proximo = cartoes
      .filter((cartao) => cartao.fatura_atual > 0)
      .map((cartao) => {
        const diasRestantes = cartao.dia_vencimento >= hoje
          ? cartao.dia_vencimento - hoje
          : 30 - hoje + cartao.dia_vencimento;
        return { ...cartao, diasRestantes };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes)[0];

    return proximo || null;
  }, [cartoes]);
  const ocultar = (v: string) => saldoOculto ? '??????' : v;
  const prioridadesFinanceiras = useMemo<ItemPrioridadeFinanceira[]>(() => {
    const vencimentosUrgentes = detalheResumo.apagar.cartoes.filter((cartao) => cartao.diasParaVencer <= 3);
    const previsoesUrgentes = proximosGastos.filter((gasto) => gasto.diasRestantes <= 3);
    return [
      {
        id: 'dashboard-urgente',
        titulo: 'Vence em até 3 dias',
        detalhe: 'Cartões e cobranças de curtíssimo prazo.',
        quantidade: vencimentosUrgentes.length + previsoesUrgentes.length,
        tone: 'danger',
      },
      {
        id: 'dashboard-apagar',
        titulo: 'Falta pagar',
        detalhe: 'Faturas abertas + pendências do mês.',
        valor: ocultar(formatarMoeda(aPagarMesAtual)),
        tone: 'warning',
      },
      {
        id: 'dashboard-debitado',
        titulo: 'Debitado do saldo',
        detalhe: 'O que já saiu da conta até hoje.',
        valor: ocultar(formatarMoeda(detalheResumo.pago.total)),
        tone: 'info',
      },
      {
        id: 'dashboard-respiro',
        titulo: 'Saldo projetado',
        detalhe: 'Saldo em conta menos o que ainda falta pagar.',
        valor: ocultar(formatarMoeda(saldoProjetado)),
        tone: saldoProjetado >= 0 ? 'success' : 'danger',
      },
    ];
  }, [aPagarMesAtual, detalheResumo.apagar.cartoes, detalheResumo.pago.total, ocultar, proximosGastos, saldoProjetado]);

  const transacoesPorConta = useMemo(() => {
    const mapa: Record<string, Transacao[]> = {};
    transacoes.forEach((transacao) => {
      if (!transacao.conta_id) return;
      mapa[transacao.conta_id] = [...(mapa[transacao.conta_id] || []), transacao];
    });
    return mapa;
  }, [transacoes]);

  const transacoesPorCartao = useMemo(() => {
    const mapa: Record<string, Transacao[]> = {};
    transacoes.forEach((transacao) => {
      if (!transacao.cartao_id) return;
      mapa[transacao.cartao_id] = [...(mapa[transacao.cartao_id] || []), transacao];
    });
    return mapa;
  }, [transacoes]);

  function abrirEdicaoTransacao(transacao: Transacao) {
    setTransacaoDetalhe(null);
    setTransacaoEditando(transacao);
    setModalEdicaoAberto(true);
  }

  const contaModal = contas.find((conta) => conta.id === contaModalId) || null;
  const cartaoModal = cartoes.find((cartao) => cartao.id === cartaoModalId) || null;

  async function handleImportarArquivoCartao(event: React.ChangeEvent<HTMLInputElement>) {
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
      mensagem: 'IA lendo o arquivo e cruzando com a fatura...',
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
        formData.append('legenda', `Fatura ou histórico do cartão ${cartao.nome} do banco ${BANCO_INFO[cartao.banco].nome}`);
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

      const data = await resposta.json() as RespostaIAArquivo | { error?: string };
      if (!resposta.ok) {
        throw new Error('error' in data ? (data.error || 'Erro ao analisar o arquivo.') : 'Erro ao analisar o arquivo.');
      }

      const payload = data as RespostaIAArquivo;
      const extraidas = payload.transacoes || (payload.transacao ? [payload.transacao] : []);
      if (!extraidas.length) {
        throw new Error('A IA não encontrou compras válidas nesse arquivo.');
      }

      const existentes = transacoes.filter((transacao) => transacao.cartao_id === cartao.id);
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
          origem: 'assistente_imagem',
          cartao_id: cartao.id,
        });
        importadas += 1;
      });

      setCartaoModalId(cartao.id);
      setStatusImportacao({
        cartaoId: cartao.id,
        tipo: 'sucesso',
        mensagem: importadas > 0
          ? `${importadas} nova${importadas > 1 ? 's' : ''} compra${importadas > 1 ? 's foram' : ' foi'} importada${importadas > 1 ? 's' : ''} na fatura de ${getDescricaoPeriodoReferencia(periodoReferencia)}.${ignoradasPorDuplicidade > 0 ? ` ${ignoradasPorDuplicidade} cobranca${ignoradasPorDuplicidade > 1 ? 's foram' : ' foi'} ignorada${ignoradasPorDuplicidade > 1 ? 's' : ''} por ja existir${ignoradasPorDuplicidade > 1 ? 'em' : ''} nesse mes pelo valor exato.` : ''}`
          : `Nenhuma nova compra foi importada. As cobrancas desse arquivo ja existiam na fatura de ${getDescricaoPeriodoReferencia(periodoReferencia)} pelo valor exato.`,
      });
    } catch (error) {
      setStatusImportacao({
        cartaoId: cartao.id,
        tipo: 'erro',
        mensagem: error instanceof Error ? error.message : 'Não foi possível atualizar esse cartão com IA.',
      });
    } finally {
      setCartaoImportandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <input
        ref={arquivoCartaoRef}
        type="file"
        accept="application/pdf,.pdf,text/csv,.csv,image/*"
        className="hidden"
        onChange={handleImportarArquivoCartao}
      />

      {/* Header */}
      <section className="rounded-[28px] border border-white/8 bg-white/[0.025] p-4 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="mb-1 text-sm font-medium text-slate-400">Olá, Paulo!</p>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Resumo principal</p>
            <div className="mt-3 flex items-center gap-3">
              <h1 className="text-3xl font-bold tabular-nums sm:text-4xl" style={{ color: corSaldoMes }}>
                {saldoOculto ? 'R$ ??????' : formatarMoeda(saldoMesAnimado)}
              </h1>
              <button
                onClick={() => setSaldoOculto(v => !v)}
                className="rounded-full border border-white/10 p-2 text-slate-500 transition-colors hover:text-slate-300"
                aria-label={saldoOculto ? 'Mostrar saldo' : 'Ocultar saldo'}
              >
                {saldoOculto ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Saldo em conta menos o que ainda precisa ser pago em {MESES_ABREV[mes - 1]} {ano}
            </p>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3 lg:max-w-[540px]">
            <div className="rounded-2xl border border-white/8 bg-[#0F1423]/72 px-4 py-3">
              <p className="text-[11px] font-medium text-slate-500">Estrutura</p>
              <p className="mt-1 text-xs font-semibold text-slate-200 sm:text-sm">
                {ocultar(`${contas.length} conta${contas.length === 1 ? '' : 's'} · ${cartoes.length} cart${cartoes.length === 1 ? 'ão' : 'ões'}`)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0F1423]/72 px-4 py-3">
              <p className="text-[11px] font-medium text-slate-500">Fatura atual</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-slate-200">
                {ocultar(formatarMoeda(totalFaturaAtual))}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0F1423]/72 px-4 py-3">
              <p className="text-[11px] font-medium text-slate-500">Próximo vencimento</p>
              <p className="mt-1 text-sm font-semibold text-slate-200">
                {proximoVencimento
                  ? `${proximoVencimento.nome} · ${proximoVencimento.diasRestantes === 0 ? 'hoje' : `${proximoVencimento.diasRestantes}d`}`
                  : 'Sem pendência'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Resumo financeiro - 4 cards clicáveis */}
      <section>
        <SectionHeader
          title="Visão do mês"
          subtitle="Quatro indicadores centrais. O detalhe completo aparece só ao abrir cada card."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DashboardMetricCard
            title="Gastos do mês"
            value={ocultar(formatarMoeda(despesasAnimado))}
            subtitle="Todos os gastos lançados no mês."
            icon={<TrendingDown size={16} />}
            tone="expense"
            onClick={() => setModalResumo('gastos')}
          />
          <DashboardMetricCard
            title="Recebido"
            value={ocultar(formatarMoeda(receitasAnimado))}
            subtitle="Entradas registradas no período."
            icon={<TrendingUp size={16} />}
            tone="income"
            onClick={() => setModalResumo('recebimentos')}
          />
          <DashboardMetricCard
            title="Debitado do saldo"
            value={ocultar(formatarMoeda(totalPagoAnimado))}
            subtitle="Saídas que já saíram da conta."
            icon={<CheckCircle2 size={16} />}
            tone="income"
            onClick={() => setModalResumo('pago')}
          />
          <DashboardMetricCard
            title="Falta pagar"
            value={ocultar(formatarMoeda(aPagarAnimado))}
            subtitle="Faturas e pendências ainda abertas."
            icon={<Clock size={16} />}
            tone="warning"
            onClick={() => setModalResumo('apagar')}
          />
        </div>
        <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-[11px] text-slate-500">
          <div><span className="text-slate-300">Saldo projetado:</span> saldo em conta menos tudo o que ainda falta pagar no mês.</div>
          <div className="mt-1"><span className="text-slate-300">Gastos do mês:</span> soma de todos os gastos lançados no mês selecionado.</div>
          <div className="mt-1"><span className="text-slate-300">Debitado do saldo:</span> somente saídas já realizadas fora do cartão.</div>
          <div className="mt-1"><span className="text-slate-300">Falta pagar:</span> faturas atuais dos cartões + pendências extras ainda abertas.</div>
        </div>
      </section>

      <PainelPrioridadesFinanceiras
        itens={prioridadesFinanceiras}
        subtitulo="Leitura rápida do que pede ação agora antes de entrar nos blocos analíticos."
      />

      {/* Modal detalhe dos cards resumo */}
      {modalResumo && (
        <ModalResumoCard
          tipo={modalResumo}
          dados={detalheResumo}
          onFechar={() => setModalResumo(null)}
          ocultar={ocultar}
          onNavegar={() => onNovoPagina('transacoes')}
        />
      )}

      {/* Próximas faturas */}
      <UpcomingCard cartoes={cartoes} onNavegar={() => onNovoPagina('cartoes')} />

      {/* Contas bancárias com sparkline */}
      <section>
        <SectionHeader
          title="Contas bancárias"
          subtitle="Saldos agrupados em uma faixa mais leve, sem disputar com os KPIs."
          icon={<Building2 size={15} />}
          actionLabel="Ver tudo"
          onAction={() => onNovoPagina('bancos')}
        />
        {contas.length > 0 ? (
          <>
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max snap-x snap-mandatory gap-2 pr-4">
                {contas.map((conta) => {
                  const info = BANCO_INFO[conta.banco] || BANCO_INFO.outro;
                  return (
                    <button
                      key={conta.id}
                      type="button"
                      onClick={() => setContaModalId(conta.id)}
                      className="min-w-[140px] snap-start rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left text-white transition-all hover:bg-white/[0.05] hover:border-white/15"
                    >
                      <div className="flex items-center gap-2">
                        <BankLogo banco={conta.banco} size={24} className="h-6 w-6 object-contain flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[10px] font-medium tracking-wide text-slate-500">{info.nome}</div>
                          <div className="mt-1 text-sm font-semibold leading-none tabular-nums">{ocultar(formatarMoeda(conta.saldo))}</div>
                        </div>
                        <ArrowRight size={12} className="text-slate-500 flex-shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </>
        ) : (
          <div className="glass-card flex flex-col items-center justify-center py-10 text-slate-600">
            <Building2 size={36} className="mb-2 opacity-30" />
            <p className="text-sm text-slate-500">Nenhuma conta cadastrada</p>
          </div>
        )}
      </section>

      {/* Cartões de crédito */}
      <section>
        <SectionHeader
          title="Cartões de crédito"
          subtitle="Faturas atuais visíveis, com o detalhe completo só quando você abrir o cartão."
          icon={<CreditCard size={15} />}
          actionLabel="Ver tudo"
          onAction={() => onNovoPagina('cartoes')}
        />
        {cartoes.length > 0 ? (
          <>
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max snap-x snap-mandatory gap-2 pr-4">
                {cartoes.map((cartao) => (
                  <button
                    key={cartao.id}
                    type="button"
                    onClick={() => setCartaoModalId(cartao.id)}
                    className="min-w-[148px] snap-start rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left text-white transition-all hover:bg-white/[0.05] hover:border-white/15"
                  >
                    <div className="flex items-center gap-2">
                      <div className="relative flex-shrink-0">
                        <BankLogo banco={cartao.banco} size={24} className="h-6 w-6 object-contain" />
                        <CardBrandLogo banco={cartao.banco} nomeCartao={cartao.nome} bandeira={cartao.bandeira} size={12} className="absolute -bottom-1 -right-1 h-3 w-3 object-contain shadow-sm" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] font-medium tracking-wide text-slate-500">{BANCO_INFO[cartao.banco].nome}</div>
                        <div className="mt-1 text-sm font-semibold leading-none tabular-nums">{ocultar(formatarMoeda(cartao.fatura_atual))}</div>
                      </div>
                      <ArrowRight size={12} className="text-slate-500 flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </>
        ) : (
          <div className="glass-card flex flex-col items-center justify-center py-10 text-slate-600">
            <CreditCard size={36} className="mb-2 opacity-30" />
            <p className="text-sm text-slate-500">Nenhum cartão cadastrado</p>
          </div>
        )}
        <div className="hidden space-y-3">
          {cartoes.map(cartao => {
            const info = BANCO_INFO[cartao.banco] || BANCO_INFO.outro;
            const pct = cartao.limite > 0 ? (cartao.fatura_atual / cartao.limite) * 100 : 0;
            const disponivel = cartao.limite - cartao.fatura_atual;
            const hoje = new Date().getDate();
            const diasVenc = cartao.dia_vencimento >= hoje
              ? cartao.dia_vencimento - hoje
              : 30 - hoje + cartao.dia_vencimento;

            return (
              <button key={cartao.id} onClick={() => onNovoPagina('cartoes')}
                className="glass-card p-4 w-full text-left relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl" style={{ background: info.cor }} />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <BankLogo banco={cartao.banco} size={36} className="h-9 w-9 rounded-xl border border-white/10 p-1 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-white">{cartao.nome}</div>
                      <div className="text-[11px] text-slate-500 capitalize">{cartao.bandeira}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold tabular-nums ${pct > 80 ? 'text-red-400' : pct > 50 ? 'text-yellow-400' : 'text-white'}`}>
                      {ocultar(formatarMoeda(cartao.fatura_atual))}
                    </div>
                    <div className="text-[11px] text-slate-500">fatura atual</div>
                  </div>
                </div>
                <div className="mb-2">
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(pct, 100)}%`, background: pct > 80 ? '#EF4444' : pct > 50 ? '#F59E0B' : info.cor }} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Disponível: <span className="text-emerald-400 font-medium">{ocultar(formatarMoeda(disponivel))}</span></span>
                  <span>Vence em <span className={`font-medium ${diasVenc <= 5 ? "text-red-400" : "text-slate-300"}`}>{diasVenc}d</span> • dia {cartao.dia_vencimento}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Gastos por Categoria */}
      <div className="rounded-[24px] border border-white/8 bg-white/[0.025] p-5">
        <SectionHeader
          title="Gastos por categoria"
          subtitle="Visão analítica com foco nas maiores categorias do mês."
        />
        {catFiltro && (
          <button onClick={() => setCatFiltro(null)} className="-mt-1 mb-3 text-xs text-slate-400 transition-colors hover:text-white">
            Limpar filtro: {catFiltro}
          </button>
        )}
        {dadosMes.graficoPizza.length > 0 ? (
          <CategoryDonut
            items={dadosMes.graficoPizza}
            selectedCat={catFiltro}
            onSelect={setCatFiltro}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-slate-600">
            <Wallet size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Sem gastos registrados</p>
          </div>
        )}
      </div>

      {/* Análise IA com typewriter */}
      {dicasIA.length > 0 && (
        <section>
          <SectionHeader
            title="Análise da IA"
            subtitle="Insights e alertas em segundo plano, sem poluir a leitura principal."
            icon={<Sparkles size={15} className="text-sky-400" />}
          />
          {carregandoAutomacoes && (
            <div className="mb-3 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Loader2 size={11} className="animate-spin" />
              Atualizando automações
            </div>
          )}
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => void atualizarAnaliseIA()}
              disabled={carregandoAutomacoes}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-200 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {carregandoAutomacoes ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {carregandoAutomacoes ? 'Atualizando análise' : 'Atualizar análise'}
            </button>
          </div>
          <InsightCard
            dicas={dicasIA as DicaItem[]}
            onVerAssistente={() => onNovoPagina('assistente')}
          />
        </section>
      )}

      {/* Gastos Fixos e Recorrentes */}
      {(gastosFixos.fixos.length > 0 || gastosFixos.parcelados.length > 0) && (
        <section>
          <SectionHeader
            title="Fixos e recorrentes"
            subtitle="Detalhe rápido das obrigações que mais se repetem no fluxo."
            actionLabel="Ver tudo"
            onAction={() => onNovoPagina('transacoes')}
          />

          {gastosFixos.fixos.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Gastos fixos</p>
              <div className="space-y-2 mb-3">
                {gastosFixos.fixos.map(t => {
                  const cat = categorias.find(c => c.id === t.categoria_id);
                  return (
                    <button key={t.id} type="button" onClick={() => setTransacaoDetalhe(t)}
                      className="glass-card flex items-center gap-3 p-3 w-full text-left hover:bg-white/[0.06] transition-colors">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                        style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)', color: cat?.cor || '#94A3B8' }}>
                        {cat?.icone || '??'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{t.descricao}</div>
                        <div className="text-[11px] text-slate-500">{cat?.nome || 'Outros'} • Recorrente mensal</div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums text-red-400 flex-shrink-0">
                        -{ocultar(formatarMoeda(t.valor))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {gastosFixos.parcelados.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Parcelados em andamento</p>
              <div className="space-y-2 mb-3">
                {gastosFixos.parcelados.map(t => {
                  const cat = categorias.find(c => c.id === t.categoria_id);
                  return (
                    <button key={t.id} type="button" onClick={() => setTransacaoDetalhe(t)}
                      className="glass-card flex items-center gap-3 p-3 w-full text-left hover:bg-white/[0.06] transition-colors">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                        style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)', color: cat?.cor || '#94A3B8' }}>
                        {cat?.icone || '??'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{t.descricao}</div>
                        <div className="text-[11px] text-slate-500">{cat?.nome || 'Outros'} • {t.parcelas}x parcelado</div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums text-red-400 flex-shrink-0">
                        -{ocultar(formatarMoeda(t.valor))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="glass-card p-3 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Total fixos + recorrentes
              <span className="text-slate-600 ml-1">({gastosFixos.fixos.length + gastosFixos.parcelados.length} itens)</span>
            </span>
            <span className="text-sm font-bold text-red-400 tabular-nums">
              -{ocultar(formatarMoeda(
                [...gastosFixos.fixos, ...gastosFixos.parcelados].reduce((s, t) => s + t.valor, 0)
              ))}
            </span>
          </div>
        </section>
      )}

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
          onEditar={() => abrirEdicaoTransacao(transacaoDetalhe)}
          onFechar={() => setTransacaoDetalhe(null)}
        />
      )}

      {/* Alertas de Orçamento */}
      {(() => {
        const alertas = orcamentos
          .filter(o => o.mes === mes && o.ano === ano && o.valor_limite > 0)
          .map(o => {
            const gasto = transacoes
              .filter(t => {
                return t.tipo === 'despesa'
                  && t.categoria_id === o.categoria_id
                  && transacaoContaNoMesAteData(t, mes, ano, hoje);
              })
              .reduce((s, t) => s + t.valor, 0);
            const pct = (gasto / o.valor_limite) * 100;
            return { o, gasto, pct };
          })
          .filter(({ pct }) => pct >= 80)
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 3);

        if (alertas.length === 0) return null;

        return (
          <section>
            <SectionHeader
              title="Alertas de orçamento"
              subtitle="Categorias que estão pressionando o limite do mês."
              actionLabel="Ver orçamentos"
              onAction={() => onNovoPagina('orcamentos')}
            />
            <div className="space-y-2">
              {alertas.map(({ o, gasto, pct }) => {
                const cat = categorias.find(c => c.id === o.categoria_id);
                const corBarra = pct >= 100 ? '#EF4444' : pct >= 90 ? '#F97316' : '#F59E0B';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onNovoPagina('orcamentos')}
                    className="glass-card p-3 w-full text-left"
                    style={{ borderColor: `${corBarra}33` }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)', color: cat?.cor || '#94A3B8' }}
                      >
                        {cat?.icone || '??'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{cat?.nome || 'Outros'}</p>
                        <p className="text-[10px] text-slate-500 tabular-nums">
                          {formatarMoeda(gasto)} / {formatarMoeda(o.valor_limite)}
                        </p>
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: corBarra }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(pct, 100)}%`, background: corBarra }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Próximos gastos (7 dias) */}
      {proximosGastos.length > 0 && (
        <section>
          <SectionHeader
            title="Gastos previstos - 7 dias"
            subtitle="Pendências de curto prazo para priorizar agora."
            actionLabel="Ver todos"
            onAction={() => onNovoPagina('agentes')}
          />
          <div className="space-y-2">
            {proximosGastos.slice(0, 3).map((g, i) => {
              const urgente = g.diasRestantes <= 3;
              const dataFormatada = parseFinancialDate(g.data).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'short',
              });
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onNovoPagina('agentes')}
                  className={`glass-card flex items-center gap-3 p-3 w-full text-left ${urgente ? 'border-amber-500/20' : ''}`}
                >
                  <div className="text-lg flex-shrink-0">•</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{g.descricao}</div>
                    <div className={`text-xs mt-0.5 ${urgente ? 'text-amber-400 font-semibold' : 'text-slate-500'}`}>
                      {urgente && 'Atenção: '}
                      {dataFormatada} • {g.diasRestantes === 0 ? 'Hoje' : g.diasRestantes === 1 ? 'Amanhã' : `Em ${g.diasRestantes} dias`}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-red-400 tabular-nums flex-shrink-0">
                    -{formatarMoeda(g.valor)}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Score de Saúde Financeira */}
      <ScoreWidget score={score} onNavegar={() => onNovoPagina('agentes')} />

      {contaModal && (
        <ModalContaBancaria
          conta={contaModal}
          lista={ordenarTransacoesPorDataDesc(transacoesPorConta[contaModal.id] || [])}
          categorias={categorias}
          cartoes={cartoes}
          ocultar={ocultar}
          mes={mes}
          ano={ano}
          hoje={hoje}
          onFechar={() => setContaModalId(null)}
          onTransacao={(t) => { setContaModalId(null); setTransacaoDetalhe(t); }}
        />
      )}

      {cartaoModal && (
        <ModalCartaoCredito
          cartao={cartaoModal}
          lista={ordenarTransacoesPorDataDesc(transacoesPorCartao[cartaoModal.id] || [])}
          categorias={categorias}
          ocultar={ocultar}
          statusImportacao={statusImportacao}
          cartaoImportandoId={cartaoImportandoId}
          configOcr={(config.ai_modelo_ocr_padrao || 'automatico') as AIModelId}
          onImportar={() => { setCartaoImportandoId(cartaoModal.id); arquivoCartaoRef.current?.click(); }}
          onAtualizarOcr={(v) => atualizarConfig({ ai_modelo_ocr_padrao: v })}
          onFechar={() => setCartaoModalId(null)}
          onTransacao={(t) => { setCartaoModalId(null); setTransacaoDetalhe(t); }}
        />
      )}

    </div>
  );
}






