'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, TrendingUp, Calendar, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { construirContexto } from '@/lib/contexto-financeiro';
import { calcularPrevisao, GastoPrevisto } from '@/lib/previsao';
import { calcularScore } from '@/lib/score-financeiro';
import { formatarMoeda } from '@/lib/storage';
import { isSameFinancialMonth, parseFinancialDate } from '@/lib/date';
import AIModelSelect from '@/components/ui/AIModelSelect';
import type { AIModelId } from '@/lib/ai/catalog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgenteInsight {
  tipo: string;
  titulo: string;
  mensagem: string;
  acao?: string;
}

interface AgenteCache {
  ts: number;
  insights: AgenteInsight[];
}

type AgenteId = 'albert' | 'marie' | 'galileu';

// ─── Config ───────────────────────────────────────────────────────────────────

const TTL: Record<AgenteId, number> = {
  albert:  24 * 60 * 60 * 1000,
  marie:   7  * 24 * 60 * 60 * 1000,
  galileu: 30 * 24 * 60 * 60 * 1000,
};

const AGENTE_CONFIG = [
  {
    id: 'albert' as AgenteId,
    nome: 'Albert',
    emoji: '🔍',
    badge: 'Diário',
    descricao: 'Monitor de anomalias financeiras e alertas urgentes do dia a dia.',
    cor: {
      border: 'border-blue-500/20',
      bg: 'bg-blue-500/5',
      badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
      button: 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30',
      dot: 'bg-blue-400',
    },
  },
  {
    id: 'marie' as AgenteId,
    nome: 'Marie',
    emoji: '📊',
    badge: 'Quinzenal',
    descricao: 'Analista comportamental — detecta padrões e oportunidades de economia.',
    cor: {
      border: 'border-purple-500/20',
      bg: 'bg-purple-500/5',
      badge: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
      button: 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30',
      dot: 'bg-purple-400',
    },
  },
  {
    id: 'galileu' as AgenteId,
    nome: 'Galileu',
    emoji: '🔭',
    badge: 'Mensal',
    descricao: 'Estrategista financeiro — projeções de longo prazo e alocação de recursos.',
    cor: {
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/5',
      badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      button: 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30',
      dot: 'bg-amber-400',
    },
  },
];

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheKey(id: AgenteId) {
  return `agente_cache_${id}`;
}

function lerCache(id: AgenteId): AgenteCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgenteCache;
    if (Date.now() - parsed.ts > TTL[id]) return null;
    return parsed;
  } catch {
    return null;
  }
}

function salvarCache(id: AgenteId, insights: AgenteInsight[]) {
  try {
    const cache: AgenteCache = { ts: Date.now(), insights };
    localStorage.setItem(cacheKey(id), JSON.stringify(cache));
  } catch {
    // ignore storage errors
  }
}

function formatarDataCache(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function iconeInsight(tipo: string) {
  if (tipo === 'alerta') return <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />;
  if (tipo === 'ok') return <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />;
  if (tipo === 'tendencia') return <TrendingUp size={14} className="text-purple-400 flex-shrink-0" />;
  if (tipo === 'projecao') return <TrendingUp size={14} className="text-amber-400 flex-shrink-0" />;
  return <CheckCircle size={14} className="text-slate-400 flex-shrink-0" />;
}

function corNivel(nivel: string): { bar: string; text: string } {
  if (nivel === 'otimo') return { bar: '#10B981', text: 'text-emerald-400' };
  if (nivel === 'bom')   return { bar: '#22C55E', text: 'text-green-400' };
  if (nivel === 'atencao') return { bar: '#F59E0B', text: 'text-amber-400' };
  return { bar: '#EF4444', text: 'text-red-400' };
}

function labelNivel(nivel: string): string {
  if (nivel === 'otimo') return 'Ótimo';
  if (nivel === 'bom') return 'Bom';
  if (nivel === 'atencao') return 'Atenção';
  return 'Crítico';
}

// ─── InsightItem ──────────────────────────────────────────────────────────────

function InsightItem({ insight }: { insight: AgenteInsight }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1">
      <div className="flex items-start gap-2">
        {iconeInsight(insight.tipo)}
        <p className="text-sm font-semibold text-white leading-snug">{insight.titulo}</p>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed pl-5">{insight.mensagem}</p>
      {insight.acao && (
        <p className="text-xs text-slate-500 pl-5 italic">{insight.acao}</p>
      )}
    </div>
  );
}

// ─── AgenteCard ───────────────────────────────────────────────────────────────

interface AgenteCardProps {
  config: typeof AGENTE_CONFIG[number];
  contexto: string;
  aiModel: AIModelId;
}

function AgenteCard({ config, contexto, aiModel }: AgenteCardProps) {
  const [insights, setInsights] = useState<AgenteInsight[]>([]);
  const [cacheTs, setCacheTs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const cached = lerCache(config.id);
    if (cached) {
      const timeout = setTimeout(() => {
        setInsights(cached.insights);
        setCacheTs(cached.ts);
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [config.id]);

  const analisar = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setErro(null);

    try {
      const res = await fetch('/api/agentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agente: config.id, contexto, aiModel }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { insights: AgenteInsight[] };
      const newInsights = data.insights ?? [];
      setInsights(newInsights);
      const now = Date.now();
      setCacheTs(now);
      salvarCache(config.id, newInsights);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [config.id, contexto, loading]);

  return (
    <div className={`rounded-2xl border ${config.cor.border} ${config.cor.bg} p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{config.emoji}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">{config.nome}</h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.cor.badge}`}>
                {config.badge}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 leading-snug max-w-xs">{config.descricao}</p>
          </div>
        </div>
        <button
          onClick={analisar}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${config.cor.button} disabled:opacity-50 flex-shrink-0`}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Analisando...' : 'Analisar agora'}
        </button>
      </div>

      {cacheTs && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <Clock size={11} />
          Última análise: {formatarDataCache(cacheTs)}
        </div>
      )}

      {erro && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
          Erro: {erro}
        </div>
      )}

      {insights.length > 0 ? (
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <InsightItem key={i} insight={insight} />
          ))}
        </div>
      ) : !loading && !erro ? (
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-6 text-center">
          <p className="text-xs text-slate-600">Nenhuma análise ainda</p>
          <p className="text-[11px] text-slate-700 mt-1">Clique em &quot;Analisar agora&quot; para começar</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── ProximosGastos ───────────────────────────────────────────────────────────

function ProximosGastos({ previsoes }: { previsoes: GastoPrevisto[] }) {
  if (previsoes.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
        <Calendar size={28} className="mx-auto mb-2 text-slate-600 opacity-40" />
        <p className="text-sm text-slate-600">Nenhum gasto previsto nos próximos 30 dias</p>
        <p className="text-xs text-slate-700 mt-1">Adicione transações recorrentes para ativar a previsão</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {previsoes.map((g, i) => {
        const urgente = g.diasRestantes <= 3;
        const dataFormatada = parseFinancialDate(g.data).toLocaleDateString('pt-BR', {
          day: '2-digit', month: 'short',
        });

        return (
          <div
            key={i}
            className={`rounded-xl border p-3 flex items-center gap-3 ${
              urgente
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-white/[0.06] bg-white/[0.02]'
            }`}
          >
            <div className="text-lg flex-shrink-0">{g.tipo === 'assinatura' ? '🔄' : '💳'}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{g.descricao}</p>
              <p className={`text-xs mt-0.5 ${urgente ? 'text-amber-400 font-semibold' : 'text-slate-500'}`}>
                {urgente && '⚠ '}
                {dataFormatada} •{' '}
                {g.diasRestantes === 0
                  ? 'Hoje'
                  : g.diasRestantes === 1
                  ? 'Amanhã'
                  : `Em ${g.diasRestantes} dias`}
              </p>
            </div>
            <div className="text-sm font-bold text-red-400 tabular-nums flex-shrink-0">
              -{formatarMoeda(g.valor)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── EvolucaoScore ────────────────────────────────────────────────────────────

function EvolucaoScore() {
  const { transacoes, orcamentos, contas, cartoes, metas } = useFinanceiroStore();
  const [mostrarFatores, setMostrarFatores] = useState(false);

  const historicoScore = useMemo(() => {
    const hoje = new Date();
    const resultado: { mes: string; mesNum: number; anoNum: number; score: number; nivel: string }[] = [];

    for (let i = 5; i >= 0; i--) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const mesNum = data.getMonth() + 1;
      const anoNum = data.getFullYear();

      const txMes = transacoes.filter(t => {
        return isSameFinancialMonth(t.data, mesNum, anoNum);
      });

      const orcMes = orcamentos.filter(o => o.mes === mesNum && o.ano === anoNum);

      const score = calcularScore({
        transacoes: txMes,
        orcamentos: orcMes,
        contas,
        cartoes,
        metas,
      });

      resultado.push({
        mes: MESES_ABREV[mesNum - 1],
        mesNum,
        anoNum,
        score: score.total,
        nivel: score.nivel,
      });
    }

    return resultado;
  }, [transacoes, orcamentos, contas, cartoes, metas]);

  const scoreMesAtual = useMemo(() => {
    const hoje = new Date();
    const mes = hoje.getMonth() + 1;
    const ano = hoje.getFullYear();
    const txMes = transacoes.filter(t => {
      return isSameFinancialMonth(t.data, mes, ano);
    });
    const orcMes = orcamentos.filter(o => o.mes === mes && o.ano === ano);
    return calcularScore({ transacoes: txMes, orcamentos: orcMes, contas, cartoes, metas });
  }, [transacoes, orcamentos, contas, cartoes, metas]);

  const penultimo = historicoScore[historicoScore.length - 2];
  const atual = historicoScore[historicoScore.length - 1];

  const tendencia = penultimo && atual
    ? atual.score > penultimo.score
      ? `Alta de ${atual.score - penultimo.score} pontos em relação ao mês anterior.`
      : atual.score < penultimo.score
      ? `Queda de ${penultimo.score - atual.score} pontos em relação ao mês anterior.`
      : 'Score estável em relação ao mês anterior.'
    : '';

  const arcRaio = 44;
  const arcCirc = Math.PI * arcRaio;
  const arcOffset = arcCirc - (scoreMesAtual.total / 100) * arcCirc;
  const arcColor = corNivel(scoreMesAtual.nivel).bar;

  return (
    <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white">Evolução do Score</h3>
        <p className="text-xs text-slate-500 mt-0.5">Últimos 6 meses</p>
      </div>

      {/* Grafico de barras SVG */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${historicoScore.length * 60} 100`}
          className="w-full"
          style={{ minWidth: `${historicoScore.length * 60}px`, height: '100px' }}
          preserveAspectRatio="xMidYMid meet"
        >
          {historicoScore.map((h, i) => {
            const barHeight = Math.max(4, (h.score / 100) * 60);
            const x = i * 60 + 10;
            const barY = 70 - barHeight;
            const cores = corNivel(h.nivel);
            const eMesAtual = i === historicoScore.length - 1;
            const barW = eMesAtual ? 32 : 28;
            const xAjust = eMesAtual ? x - 2 : x;

            return (
              <g key={i}>
                {/* Barra */}
                <rect
                  x={xAjust}
                  y={barY}
                  width={barW}
                  height={barHeight}
                  rx={4}
                  fill={cores.bar}
                  opacity={eMesAtual ? 1 : 0.6}
                />
                {/* Brilho no topo para mes atual */}
                {eMesAtual && (
                  <rect
                    x={xAjust}
                    y={barY}
                    width={barW}
                    height={4}
                    rx={4}
                    fill="white"
                    opacity={0.2}
                  />
                )}
                {/* Score acima da barra */}
                <text
                  x={xAjust + barW / 2}
                  y={barY - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill={cores.bar}
                  fontWeight={eMesAtual ? 'bold' : 'normal'}
                >
                  {h.score}
                </text>
                {/* Label do mes */}
                <text
                  x={x + 14}
                  y={85}
                  textAnchor="middle"
                  fontSize={9}
                  fill={eMesAtual ? '#e2e8f0' : '#64748b'}
                  fontWeight={eMesAtual ? 'bold' : 'normal'}
                >
                  {h.mes}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Texto resumo */}
      <p className="text-xs text-slate-400">
        <span className={`font-semibold ${corNivel(scoreMesAtual.nivel).text}`}>
          Score atual: {scoreMesAtual.total}/100 ({labelNivel(scoreMesAtual.nivel)})
        </span>
        {tendencia && ` — ${tendencia}`}
      </p>

      {/* Card do score atual com arco */}
      <div className="flex items-center gap-5 bg-white/[0.02] rounded-2xl border border-white/[0.06] p-4">
        {/* Arco SVG */}
        <div className="flex-shrink-0">
          <svg width={100} height={60} viewBox="0 0 100 60">
            {/* Track */}
            <path
              d="M 8 56 A 44 44 0 0 1 92 56"
              fill="none"
              stroke="#1e293b"
              strokeWidth={10}
              strokeLinecap="round"
            />
            {/* Progresso */}
            <path
              d="M 8 56 A 44 44 0 0 1 92 56"
              fill="none"
              stroke={arcColor}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={arcCirc}
              strokeDashoffset={arcOffset}
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
            {/* Numero */}
            <text x="50" y="44" textAnchor="middle" fontSize="16" fontWeight="bold" fill="white">
              {scoreMesAtual.total}
            </text>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-lg font-bold ${corNivel(scoreMesAtual.nivel).text}`}>
            {labelNivel(scoreMesAtual.nivel)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Score financeiro atual</p>
          <button
            onClick={() => setMostrarFatores(v => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {mostrarFatores ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Ver fatores
          </button>
        </div>
      </div>

      {/* Fatores expandidos */}
      {mostrarFatores && (
        <div className="space-y-2.5">
          {scoreMesAtual.fatores.map((f, i) => {
            const pct = Math.round((f.pontos / f.maximo) * 100);
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">{f.nome}</span>
                  <span className="text-slate-500 tabular-nums">{f.pontos}/{f.maximo} pts</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: corNivel(scoreMesAtual.nivel).bar }}
                  />
                </div>
                <p className="text-[10px] text-slate-600 leading-snug">{f.descricao}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Agentes() {
  const { transacoes, categorias, contas, cartoes, config, atualizarConfig } = useFinanceiroStore();

  const contexto = construirContexto({ transacoes, categorias, contas, cartoes });
  const previsoes = calcularPrevisao(transacoes, 30);

  const totalPrevisto = previsoes.reduce((s, g) => s + g.valor, 0);

  return (
    <div className="space-y-6 animate-fade-up">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Agentes IA</h2>
        <p className="text-sm text-slate-500 mt-1">
          Análises especializadas com inteligência artificial — cada agente tem uma perspectiva única dos seus dados.
        </p>
      </div>

      <div className="max-w-xs">
        <AIModelSelect
          task="agents"
          value={config.ai_modelo_padrao || 'automatico'}
          onChange={(value) => atualizarConfig({ ai_modelo_padrao: value })}
        />
      </div>

      {/* Evolucao do Score — topo */}
      <EvolucaoScore />

      {/* Agent cards */}
      <div className="space-y-4">
        {AGENTE_CONFIG.map(cfg => (
          <AgenteCard key={cfg.id} config={cfg} contexto={contexto} aiModel={config.ai_modelo_padrao || 'automatico'} />
        ))}
      </div>

      {/* Proximos gastos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Calendar size={15} className="text-slate-500" />
              Próximos Gastos — 30 dias
            </h3>
            {previsoes.length > 0 && (
              <p className="text-xs text-slate-600 mt-0.5">
                {previsoes.length} cobrança{previsoes.length > 1 ? 's' : ''} prevista{previsoes.length > 1 ? 's' : ''} •{' '}
                total: <span className="text-red-400 font-medium">{formatarMoeda(totalPrevisto)}</span>
              </p>
            )}
          </div>
        </div>
        <ProximosGastos previsoes={previsoes} />
      </section>

    </div>
  );
}

