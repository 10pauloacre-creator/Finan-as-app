'use client';

import { useMemo, useEffect, useState, useRef } from 'react';
import {
  Wallet, ArrowRight, Eye, EyeOff, CreditCard, Building2, Sparkles,
  ArrowUpRight, ArrowDownLeft, Brain, ChevronDown, FileText, ImageIcon, Loader2,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda, mesAtual } from '@/lib/storage';
import { BANCO_INFO, BancoSlug, Categoria, Transacao } from '@/types';
import { calcularScore, ScoreFinanceiro } from '@/lib/score-financeiro';
import { calcularPrevisao } from '@/lib/previsao';
import { isSameFinancialMonth, parseFinancialDate } from '@/lib/date';
import BankLogo from '@/components/ui/BankLogo';
import CardBrandLogo from '@/components/ui/CardBrandLogo';
import OCRModelSelect from '@/components/ui/OCRModelSelect';
import { useCountUp } from '@/hooks/useCountUp';
import type { TransacaoExtraida } from '@/lib/assistente-types';

type Pagina = 'dashboard' | 'transacoes' | 'bancos' | 'cartoes' | 'relatorios' | 'investimentos' | 'assistente' | 'patrimonio' | 'orcamentos' | 'assinaturas' | 'configuracoes' | 'agentes';
interface Props { onNovoPagina: (p: Pagina) => void; }

const CORES = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#F97316', '#8B5CF6'];
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          Próximas faturas
        </span>
        <button onClick={onNavegar} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors">
          Ver cartões <ArrowRight size={12} />
        </button>
      </div>
      <div className="space-y-2">
        {proximos.map(c => {
          const urgente = c.diasRestantes < 5;
          return (
            <button
              key={c.id}
              type="button"
              onClick={onNavegar}
              className="glass-card flex items-center gap-3 p-3 w-full text-left"
            >
              <BankLogo banco={c.banco as BancoSlug} size={32} className="h-8 w-8 object-contain flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{c.nome}</div>
                <div className={`text-xs ${urgente ? 'text-red-400 font-semibold' : 'text-slate-500'}`}>
                  {urgente ? 'Urgente • ' : ''}{c.diasRestantes === 0 ? 'Vence hoje' : `Vence em ${c.diasRestantes} dia${c.diasRestantes > 1 ? 's' : ''}`}
                </div>
              </div>
              <div className="text-sm font-bold text-red-400 tabular-nums">{formatarMoeda(c.fatura_atual)}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Dashboard principal
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

function ordenarTransacoesPorData(lista: Transacao[]) {
  return [...lista].sort((a, b) => {
    const chaveA = `${a.data}T${a.horario || '00:00'}:${a.id}`;
    const chaveB = `${b.data}T${b.horario || '00:00'}:${b.id}`;
    return chaveA < chaveB ? 1 : -1;
  });
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

function calcularTotalFatura(transacoesExtraidas: TransacaoExtraida[]) {
  return transacoesExtraidas.reduce((soma, tx) => (
    soma + (tx.tipo === 'despesa' ? tx.valor : -tx.valor)
  ), 0);
}

function diasAte(dia: number) {
  const hoje = new Date().getDate();
  return dia >= hoje ? dia - hoje : 30 - hoje + dia;
}

export default function Dashboard({ onNovoPagina }: Props) {
  const {
    transacoes, categorias, contas, cartoes, orcamentos, metas, dicasIA, setDicasIA, selicAtual,
    config, atualizarConfig,
    adicionarTransacao, atualizarFaturaCartao,
  } = useFinanceiroStore();
  const { mes, ano } = mesAtual();
  const [saldoOculto, setSaldoOculto] = useState(false);
  const [catFiltro, setCatFiltro] = useState<string | null>(null);
  const [contaExpandidaId, setContaExpandidaId] = useState<string | null>(null);
  const [cartaoExpandidoId, setCartaoExpandidoId] = useState<string | null>(null);
  const [cartaoImportandoId, setCartaoImportandoId] = useState<string | null>(null);
  const [statusImportacao, setStatusImportacao] = useState<{ cartaoId: string; tipo: 'sucesso' | 'erro' | 'info'; mensagem: string } | null>(null);
  const arquivoCartaoRef = useRef<HTMLInputElement>(null);

  const dadosMes = useMemo(() => {
    const doMes = transacoes.filter(t => {
      return isSameFinancialMonth(t.data, mes, ano);
    });
    const receitas = doMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const despesas = doMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
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
      const filtrado = transacoes.filter(t => {
        return isSameFinancialMonth(t.data, m, a);
      });
      return {
        mes: MESES_ABREV[m - 1],
        receitas: filtrado.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0),
        despesas: filtrado.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0),
      };
    });

    return { receitas, despesas, saldo, graficoPizza, areaData, doMes };
  }, [transacoes, categorias, mes, ano]);

  useEffect(() => {
    if (dadosMes.doMes.length === 0) return;
    const dicas: typeof dicasIA = [];
    if (dadosMes.despesas > dadosMes.receitas * 0.9 && dadosMes.receitas > 0) {
      dicas.push({ id: '1', tipo: 'alerta', titulo: 'Gastos acima do ideal', mensagem: `Voc? usou ${((dadosMes.despesas / dadosMes.receitas) * 100).toFixed(0)}% da sua renda. O ideal ? manter abaixo de 80%.`, criado_em: new Date().toISOString() });
    }
    if (dadosMes.saldo > 0) {
      dicas.push({ id: '3', tipo: 'conquista', titulo: 'Saldo positivo!', mensagem: `Você tem ${formatarMoeda(dadosMes.saldo)} sobrando. ${selicAtual ? `Investindo na Selic (${selicAtual}% a.a.) renderiam ${formatarMoeda(dadosMes.saldo * selicAtual / 100 / 12)}/mês.` : 'Considere investir!'}`, criado_em: new Date().toISOString() });
    }
    if (dadosMes.graficoPizza.length > 0) {
      const topCat = dadosMes.graficoPizza[0];
      dicas.push({ id: '4', tipo: 'dica', titulo: `Maior gasto: ${topCat.nome}`, mensagem: `${topCat.nome} representa ${((topCat.valor / dadosMes.despesas) * 100).toFixed(0)}% dos seus gastos (${formatarMoeda(topCat.valor)}). Analise se é possível reduzir.`, criado_em: new Date().toISOString() });
    }
    setDicasIA(dicas);
  }, [dadosMes, setDicasIA, selicAtual]);

  // Score de saúde financeira
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
  const receitasAnimado = useCountUp(dadosMes.receitas);
  const despesasAnimado = useCountUp(dadosMes.despesas);
  const saldoMesAnimado = useCountUp(dadosMes.saldo);
  const corSaldoMes =
    dadosMes.saldo > 0 ? '#10B981' :
    dadosMes.saldo < 0 ? '#EF4444' :
    '#F1F5F9';

  const ocultar = (v: string) => saldoOculto ? '??????' : v;

  // Transações filtradas por categoria selecionada no donut
  const transacoesFiltradas = useMemo(() => {
    const doMes = dadosMes.doMes;
    if (!catFiltro) return doMes.slice(0, 8);
    return doMes.filter(t => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      return (cat?.nome || 'Outros') === catFiltro;
    }).slice(0, 8);
  }, [dadosMes.doMes, catFiltro, categorias]);

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

  const contaExpandida = contas.find((conta) => conta.id === contaExpandidaId) || null;
  const cartaoExpandido = cartoes.find((cartao) => cartao.id === cartaoExpandidoId) || null;

  async function handleImportarArquivoCartao(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';

    if (!arquivo || !cartaoImportandoId) return;

    const cartao = cartoes.find((item) => item.id === cartaoImportandoId);
    if (!cartao) return;

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

      extraidas.forEach((tx) => {
        const duplicada = existentes.some((existente) => (
          existente.data === tx.data &&
          existente.tipo === tx.tipo &&
          Math.abs(existente.valor - tx.valor) < 0.01 &&
          normalizarTexto(existente.descricao) === normalizarTexto(tx.descricao)
        ));

        if (duplicada) return;

        adicionarTransacao({
          valor: tx.valor,
          descricao: tx.descricao,
          categoria_id: resolverCategoriaId(tx, categorias),
          data: tx.data,
          horario: tx.hora || undefined,
          tipo: tx.tipo,
          metodo_pagamento: 'credito',
          parcelas: tx.parcelas || undefined,
          local: tx.local || undefined,
          origem: 'assistente_imagem',
          cartao_id: cartao.id,
        });
        importadas += 1;
      });

      const totalFatura = typeof payload.totalValor === 'number'
        ? payload.totalValor
        : Math.max(0, calcularTotalFatura(extraidas));

      atualizarFaturaCartao(cartao.id, totalFatura);
      setCartaoExpandidoId(cartao.id);
      setStatusImportacao({
        cartaoId: cartao.id,
        tipo: 'sucesso',
        mensagem: importadas > 0
          ? `Fatura atualizada para ${formatarMoeda(totalFatura)} e ${importadas} compra${importadas > 1 ? 's foram' : ' foi'} importada${importadas > 1 ? 's' : ''}.`
          : `Fatura atualizada para ${formatarMoeda(totalFatura)}. As compras j? estavam no app.`,
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
    <div className="flex flex-col gap-5 animate-fade-up">
      <input
        ref={arquivoCartaoRef}
        type="file"
        accept="application/pdf,.pdf,text/csv,.csv,image/*"
        className="hidden"
        onChange={handleImportarArquivoCartao}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium mb-0.5">Olá, Paulo!</p>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mb-1">Saldo do mês</p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tabular-nums" style={{
              color: corSaldoMes,
            }}>
              {saldoOculto ? 'R$ ??????' : formatarMoeda(saldoMesAnimado)}
            </h1>
            <button
              onClick={() => setSaldoOculto(v => !v)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
              aria-label={saldoOculto ? 'Mostrar saldo' : 'Ocultar saldo'}
            >
              {saldoOculto ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            {MESES_ABREV[mes - 1]} {ano} • {dadosMes.doMes.length} transações
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums text-slate-400">
            {ocultar(`${contas.length} conta${contas.length === 1 ? '' : 's'} • ${cartoes.length} cart${cartoes.length === 1 ? 'ão' : 'ões'}`)}
          </div>
          <div className="text-slate-600 text-xs">visão geral</div>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="order-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onNovoPagina('transacoes')}
          className="glass-card p-4 text-left"
          style={{ borderColor: 'rgba(16,185,129,0.2)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Entradas</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <ArrowDownLeft size={14} className="text-emerald-400" />
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-400 tabular-nums">{ocultar(formatarMoeda(receitasAnimado))}</div>
        </button>
        <button
          type="button"
          onClick={() => onNovoPagina('transacoes')}
          className="glass-card p-4 text-left"
          style={{ borderColor: 'rgba(239,68,68,0.2)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Saídas</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <ArrowUpRight size={14} className="text-red-400" />
            </div>
          </div>
          <div className="text-xl font-bold text-red-400 tabular-nums">{ocultar(formatarMoeda(despesasAnimado))}</div>
        </button>
      </div>

      {/* Score de Saúde Financeira */}
      <div className="order-5">
        <ScoreWidget score={score} onNavegar={() => onNovoPagina('agentes')} />
      </div>

      {/* Próximas faturas */}
      <div className="order-6">
        <UpcomingCard cartoes={cartoes} onNavegar={() => onNovoPagina('cartoes')} />
      </div>

      {/* Contas bancárias com sparkline */}
      <section className="order-2">
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
        {contas.length > 0 ? (
          <>
            <div className="overflow-x-auto pb-1">
              <div className="flex gap-2 min-w-max">
                {contas.map((conta) => {
                  const info = BANCO_INFO[conta.banco] || BANCO_INFO.outro;
                  const ativa = contaExpandidaId === conta.id;
                  return (
                    <button
                      key={conta.id}
                      type="button"
                      onClick={() => setContaExpandidaId((atual) => atual === conta.id ? null : conta.id)}
                      className={`min-w-[120px] rounded-xl border px-2.5 py-2 text-left transition-all ${
                        ativa
                          ? 'bg-white/[0.07] text-white border-purple-500/35 shadow-lg shadow-black/20'
                          : 'bg-white/[0.03] text-white border-white/10 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <BankLogo banco={conta.banco} size={24} className="h-6 w-6 object-contain flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 truncate">{info.nome}</div>
                          <div className="text-sm font-semibold leading-none tabular-nums mt-0.5">{ocultar(formatarMoeda(conta.saldo))}</div>
                        </div>
                        <ChevronDown size={12} className={`text-slate-500 transition-transform ${ativa ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {contaExpandida && (() => {
              const info = BANCO_INFO[contaExpandida.banco] || BANCO_INFO.outro;
              const lista = ordenarTransacoesPorData(transacoesPorConta[contaExpandida.id] || []);
              const entradasMes = lista.filter((transacao) => (
                transacao.tipo === 'receita' && isSameFinancialMonth(transacao.data, mes, ano)
              )).reduce((soma, transacao) => soma + transacao.valor, 0);
              const saidasMes = lista.filter((transacao) => (
                transacao.tipo === 'despesa' && isSameFinancialMonth(transacao.data, mes, ano)
              )).reduce((soma, transacao) => soma + transacao.valor, 0);

              return (
                <div className="glass-card mt-2 p-3.5" style={{ borderColor: `${info.cor}33` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <BankLogo banco={contaExpandida.banco} size={36} className="h-9 w-9 object-contain" />
                      <div>
                        <h3 className="text-sm font-semibold text-white">{info.nome}</h3>
                        <p className="text-xs text-slate-500">{contaExpandida.nome} • {contaExpandida.tipo}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNovoPagina('bancos')}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      Abrir conta completa
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
                      <div className="text-[11px] text-slate-500">Saldo</div>
                      <div className="text-sm font-semibold text-white tabular-nums mt-1">{ocultar(formatarMoeda(contaExpandida.saldo))}</div>
                    </div>
                    <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/10 p-3">
                      <div className="text-[11px] text-slate-500">Entradas no mês</div>
                      <div className="text-sm font-semibold text-emerald-400 tabular-nums mt-1">{ocultar(formatarMoeda(entradasMes))}</div>
                    </div>
                    <div className="rounded-2xl bg-red-500/8 border border-red-500/10 p-3">
                      <div className="text-[11px] text-slate-500">Saídas no mês</div>
                      <div className="text-sm font-semibold text-red-400 tabular-nums mt-1">{ocultar(formatarMoeda(saidasMes))}</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-400">Movimentações recentes</span>
                      <span className="text-[11px] text-slate-600">{lista.length} lançamentos</span>
                    </div>
                    <div className="space-y-2">
                      {lista.slice(0, 5).map((transacao) => {
                        const categoria = categorias.find((item) => item.id === transacao.categoria_id);
                        return (
                          <div key={transacao.id} className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm" style={{ background: categoria?.cor ? `${categoria.cor}22` : 'rgba(255,255,255,0.05)', color: categoria?.cor || '#94A3B8' }}>
                              {categoria?.icone || '??'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white truncate">{transacao.descricao}</div>
                              <div className="text-[11px] text-slate-500">
                                {categoria?.nome || 'Outros'} • {parseFinancialDate(transacao.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                              </div>
                            </div>
                            <div className={`text-sm font-semibold tabular-nums ${transacao.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {transacao.tipo === 'receita' ? '+' : '-'}{ocultar(formatarMoeda(transacao.valor))}
                            </div>
                          </div>
                        );
                      })}
                      {lista.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-600">
                          Nenhuma movimentação vinculada a essa conta ainda.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="glass-card flex flex-col items-center justify-center py-10 text-slate-600">
            <Building2 size={36} className="mb-2 opacity-30" />
            <p className="text-sm text-slate-500">Nenhuma conta cadastrada</p>
          </div>
        )}
      </section>

      {/* Cartões de crédito */}
      <section className="order-3">
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
        {cartoes.length > 0 ? (
          <>
            <div className="overflow-x-auto pb-1">
              <div className="flex gap-2 min-w-max">
                {cartoes.map((cartao) => {
                  const ativa = cartaoExpandidoId === cartao.id;
                  return (
                    <button
                      key={cartao.id}
                      type="button"
                      onClick={() => setCartaoExpandidoId((atual) => atual === cartao.id ? null : cartao.id)}
                      className={`min-w-[128px] rounded-xl border px-2.5 py-2 text-left transition-all ${
                        ativa
                          ? 'bg-white/[0.07] text-white border-purple-500/35 shadow-lg shadow-black/20'
                          : 'bg-white/[0.03] text-white border-white/10 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative flex-shrink-0">
                          <BankLogo banco={cartao.banco} size={24} className="h-6 w-6 object-contain" />
                          <CardBrandLogo banco={cartao.banco} nomeCartao={cartao.nome} bandeira={cartao.bandeira} size={12} className="absolute -bottom-1 -right-1 h-3 w-3 object-contain shadow-sm" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 truncate">{BANCO_INFO[cartao.banco].nome}</div>
                          <div className="text-sm font-semibold leading-none tabular-nums mt-0.5">{ocultar(formatarMoeda(cartao.fatura_atual))}</div>
                        </div>
                        <ChevronDown size={12} className={`text-slate-500 transition-transform ${ativa ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {cartaoExpandido && (() => {
              const info = BANCO_INFO[cartaoExpandido.banco] || BANCO_INFO.outro;
              const lista = ordenarTransacoesPorData(transacoesPorCartao[cartaoExpandido.id] || []);
              const compras = lista.filter((transacao) => transacao.tipo === 'despesa');
              const estornos = lista.filter((transacao) => transacao.tipo === 'receita');
              const totalCompras = compras.reduce((soma, transacao) => soma + transacao.valor, 0);
              const maiorCompra = compras.reduce((maior, transacao) => Math.max(maior, transacao.valor), 0);
              const ticketMedio = compras.length > 0 ? totalCompras / compras.length : 0;
              const limiteDisponivel = cartaoExpandido.limite - cartaoExpandido.fatura_atual;
              const usoLimite = cartaoExpandido.limite > 0 ? (cartaoExpandido.fatura_atual / cartaoExpandido.limite) * 100 : 0;
              const statusAtual = statusImportacao?.cartaoId === cartaoExpandido.id ? statusImportacao : null;

              return (
                <div className="glass-card mt-2 p-3.5" style={{ borderColor: `${info.cor}33` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <BankLogo banco={cartaoExpandido.banco} size={36} className="h-9 w-9 object-contain" />
                        <CardBrandLogo banco={cartaoExpandido.banco} nomeCartao={cartaoExpandido.nome} bandeira={cartaoExpandido.bandeira} size={18} className="absolute -bottom-1 -right-1 h-[18px] w-[18px] object-contain shadow-sm" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{cartaoExpandido.nome}</h3>
                        <p className="text-xs text-slate-500">{info.nome} • {cartaoExpandido.bandeira}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNovoPagina('cartoes')}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      Abrir cartão completo
                    </button>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
                    <div className="rounded-2xl bg-red-500/8 border border-red-500/10 p-3">
                      <div className="text-[11px] text-slate-500">Fatura atual</div>
                      <div className="text-sm font-semibold text-red-400 tabular-nums mt-1">{ocultar(formatarMoeda(cartaoExpandido.fatura_atual))}</div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
                      <div className="text-[11px] text-slate-500">Limite total</div>
                      <div className="text-sm font-semibold text-white tabular-nums mt-1">{ocultar(formatarMoeda(cartaoExpandido.limite))}</div>
                    </div>
                    <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/10 p-3">
                      <div className="text-[11px] text-slate-500">Disponível</div>
                      <div className="text-sm font-semibold text-emerald-400 tabular-nums mt-1">{ocultar(formatarMoeda(limiteDisponivel))}</div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
                      <div className="text-[11px] text-slate-500">Fecha / paga</div>
                      <div className="text-sm font-semibold text-white mt-1">Dia {cartaoExpandido.dia_fechamento} / {cartaoExpandido.dia_vencimento}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-slate-400">Relatório individual do cartão</p>
                        <p className="text-[11px] text-slate-600 mt-1">Uso do limite: {usoLimite.toFixed(1)}% • vencimento em {diasAte(cartaoExpandido.dia_vencimento)} dia(s)</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Média por compra</div>
                        <div className="text-sm font-semibold text-white tabular-nums">{ocultar(formatarMoeda(ticketMedio))}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Compras no app</div>
                        <div className="text-sm font-semibold text-white mt-1">{compras.length}</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Maior compra</div>
                        <div className="text-sm font-semibold text-white mt-1 tabular-nums">{ocultar(formatarMoeda(maiorCompra))}</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Estornos / créditos</div>
                        <div className="text-sm font-semibold text-emerald-400 mt-1 tabular-nums">{ocultar(formatarMoeda(estornos.reduce((soma, transacao) => soma + transacao.valor, 0)))}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <div className="min-w-[220px]">
                      <OCRModelSelect
                        value={config.ai_modelo_ocr_padrao || 'automatico'}
                        onChange={(value) => atualizarConfig({ ai_modelo_ocr_padrao: value })}
                        compact
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCartaoImportandoId(cartaoExpandido.id);
                        arquivoCartaoRef.current?.click();
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-medium bg-purple-600/15 border border-purple-500/25 text-purple-300 hover:bg-purple-600/25 transition-all flex items-center gap-1.5"
                    >
                      {cartaoImportandoId === cartaoExpandido.id ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                      I.A
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCartaoImportandoId(cartaoExpandido.id);
                        arquivoCartaoRef.current?.click();
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
                    >
                      <FileText size={14} />
                      Ler fatura PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCartaoImportandoId(cartaoExpandido.id);
                        arquivoCartaoRef.current?.click();
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
                    >
                      <ImageIcon size={14} />
                      Ler imagem / histórico
                    </button>
                  </div>

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

                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-400">Compras lançadas nesse cartão</span>
                      <span className="text-[11px] text-slate-600">{lista.length} lançamentos</span>
                    </div>
                    <div className="space-y-2">
                      {lista.slice(0, 8).map((transacao) => {
                        const categoria = categorias.find((item) => item.id === transacao.categoria_id);
                        return (
                          <div key={transacao.id} className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm" style={{ background: categoria?.cor ? `${categoria.cor}22` : 'rgba(255,255,255,0.05)', color: categoria?.cor || '#94A3B8' }}>
                              {categoria?.icone || '??'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white truncate">{transacao.descricao}</div>
                              <div className="text-[11px] text-slate-500">
                                {categoria?.nome || 'Outros'} • {parseFinancialDate(transacao.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                              </div>
                            </div>
                            <div className={`text-sm font-semibold tabular-nums ${transacao.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {transacao.tipo === 'receita' ? '+' : '-'}{ocultar(formatarMoeda(transacao.valor))}
                            </div>
                          </div>
                        );
                      })}
                      {lista.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-600">
                          Nenhuma compra vinculada a esse cartão ainda. Use o botão I.A. para importar uma fatura ou histórico.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
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

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Evolução 6 meses */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Evolução - 6 meses</h3>
          <EvolutionChart data={dadosMes.areaData} />
        </div>

        {/* Donut categorias */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">
            Gastos por Categoria
            {catFiltro && (
              <button onClick={() => setCatFiltro(null)} className="ml-2 text-xs text-purple-400 hover:text-purple-300">
                ? {catFiltro}
              </button>
            )}
          </h3>
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
      </div>

      {/* Análise IA com typewriter */}
      {dicasIA.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={15} className="text-purple-400" />
            <span className="text-sm font-semibold text-slate-300">Análise da IA</span>
          </div>
          <InsightCard
            dicas={dicasIA as DicaItem[]}
            onVerAssistente={() => onNovoPagina('assistente')}
          />
        </section>
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
                  && isSameFinancialMonth(t.data, mes, ano);
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
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-300">Alertas de Orçamento</span>
              </div>
              <button onClick={() => onNovoPagina('orcamentos')}
                className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors">
                Ver orçamentos <ArrowRight size={12} />
              </button>
            </div>
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
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-300">
              Gastos previstos - 7 dias
            </span>
            <button onClick={() => onNovoPagina('agentes')}
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors">
              Ver todos <ArrowRight size={12} />
            </button>
          </div>
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

      {/* Últimas transações */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-300">
            {catFiltro ? `Transações • ${catFiltro}` : 'Últimas Transações'}
          </span>
          <button onClick={() => onNovoPagina('transacoes')}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors">
            Ver todas <ArrowRight size={12} />
          </button>
        </div>
        <div className="space-y-2">
          {transacoesFiltradas.map(t => {
            const cat = categorias.find(c => c.id === t.categoria_id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onNovoPagina('transacoes')}
                className="glass-card flex items-center gap-3 p-3 w-full text-left"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
                  style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.05)', color: cat?.cor || '#94A3B8' }}>
                  {cat?.icone || '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{t.descricao}</div>
                  <div className="text-xs text-slate-500">
                    {cat?.nome || 'Outros'}
                    {t.metodo_pagamento && ` • ${t.metodo_pagamento}`}
                    {' • '}{parseFinancialDate(t.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </div>
                </div>
                <div className={`text-sm font-semibold tabular-nums flex-shrink-0 ${t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.tipo === 'receita' ? '+' : '-'}{formatarMoeda(t.valor)}
                </div>
              </button>
            );
          })}
          {dadosMes.doMes.length === 0 && (
            <div className="glass-card flex flex-col items-center justify-center py-12 text-slate-600">
              <Wallet size={36} className="mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-500">Nenhuma transação este mês</p>
              <p className="text-xs mt-1 text-slate-600">Use o botão + ou a importação por I.A. para começar.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}





