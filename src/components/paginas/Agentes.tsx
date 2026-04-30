'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, TrendingUp, Calendar, Clock } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { construirContexto } from '@/lib/contexto-financeiro';
import { calcularPrevisao, GastoPrevisto } from '@/lib/previsao';
import { formatarMoeda } from '@/lib/storage';

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
  albert:  24 * 60 * 60 * 1000,        // 24h
  marie:   7  * 24 * 60 * 60 * 1000,   // 7 days
  galileu: 30 * 24 * 60 * 60 * 1000,   // 30 days
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

// ─── InsightCard ──────────────────────────────────────────────────────────────

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
}

function AgenteCard({ config, contexto }: AgenteCardProps) {
  const [insights, setInsights] = useState<AgenteInsight[]>([]);
  const [cacheTs, setCacheTs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Load from cache on mount
  useEffect(() => {
    const cached = lerCache(config.id);
    if (cached) {
      setInsights(cached.insights);
      setCacheTs(cached.ts);
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
        body: JSON.stringify({ agente: config.id, contexto }),
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
      {/* Header */}
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

      {/* Last analysis time */}
      {cacheTs && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <Clock size={11} />
          Última análise: {formatarDataCache(cacheTs)}
        </div>
      )}

      {/* Error */}
      {erro && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
          Erro: {erro}
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 ? (
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <InsightItem key={i} insight={insight} />
          ))}
        </div>
      ) : !loading && !erro ? (
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-6 text-center">
          <p className="text-xs text-slate-600">Nenhuma análise ainda</p>
          <p className="text-[11px] text-slate-700 mt-1">Clique em "Analisar agora" para começar</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Próximos Gastos ──────────────────────────────────────────────────────────

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
        const dataFormatada = new Date(g.data + 'T00:00:00').toLocaleDateString('pt-BR', {
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
            <div className={`text-lg flex-shrink-0`}>{g.tipo === 'assinatura' ? '🔄' : '💳'}</div>
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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Agentes() {
  const { transacoes, categorias, contas, cartoes } = useFinanceiroStore();

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

      {/* Agent cards */}
      <div className="space-y-4">
        {AGENTE_CONFIG.map(cfg => (
          <AgenteCard key={cfg.id} config={cfg} contexto={contexto} />
        ))}
      </div>

      {/* Próximos gastos */}
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
