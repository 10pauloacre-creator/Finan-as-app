'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import iconV2 from '@/app/icons/Iconv2.png';
import {
  LayoutDashboard, ArrowLeftRight, BarChart3, TrendingUp,
  Settings, Plus, Building2, CreditCard, Cloud, CloudOff, RefreshCw, Sparkles,
  Target, Repeat, BrainCircuit, CalendarDays, MoreHorizontal, X, Search, HardDrive,
} from 'lucide-react';
import { formatarMoeda } from '@/lib/storage';
import Dashboard      from '@/components/paginas/Dashboard';
import Transacoes     from '@/components/paginas/Transacoes';
import Relatorios     from '@/components/paginas/Relatorios';
import Investimentos  from '@/components/paginas/Investimentos';
import Bancos         from '@/components/paginas/Bancos';
import Cartoes        from '@/components/paginas/Cartoes';
import Assistente     from '@/components/paginas/Assistente';
import Patrimonio     from '@/components/paginas/Patrimonio';
import Orcamentos     from '@/components/paginas/Orcamentos';
import Agentes        from '@/components/paginas/Agentes';
import Calendario     from '@/components/paginas/Calendario';
import Configuracoes  from '@/components/paginas/Configuracoes';
import ModalNovaTransacao from '@/components/modais/ModalNovaTransacao';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { TipoTransacao } from '@/types';

import { Transacao, Categoria } from '@/types';
import { FINANCEIRO_OPEN_BACKUP_EVENT } from '@/lib/storage';

type Pagina = 'dashboard' | 'transacoes' | 'relatorios' | 'investimentos' | 'bancos' | 'cartoes' | 'assistente' | 'patrimonio' | 'orcamentos' | 'configuracoes' | 'agentes' | 'calendario';

// ─── Busca Global ─────────────────────────────────────────────────────────────
const MESES_BUSCA: string[][] = [
  ['jan', 'janeiro'], ['fev', 'fevereiro'], ['mar', 'março', 'marco'],
  ['abr', 'abril'], ['mai', 'maio'], ['jun', 'junho'],
  ['jul', 'julho'], ['ago', 'agosto'], ['set', 'setembro'],
  ['out', 'outubro'], ['nov', 'novembro'], ['dez', 'dezembro'],
];

function matchesBusca(tx: Transacao, t: string): boolean {
  if (!t) return false;

  if (tx.descricao.toLowerCase().includes(t)) return true;

  // Approximate value: accept R$, spaces, commas
  const numLimpo = t.replace(/[r$\s]/gi, '').replace(',', '.');
  const numVal = parseFloat(numLimpo);
  if (!isNaN(numVal) && numVal > 0) {
    const margem = Math.max(numVal * 0.1, 5);
    if (Math.abs(tx.valor - numVal) <= margem) return true;
  }

  // Date: YYYY-MM-DD, dd/mm/yyyy, dd/mm
  const [ano, mes, dia] = tx.data.split('-');
  if (
    tx.data.includes(t)
    || `${dia}/${mes}/${ano}`.includes(t)
    || `${dia}/${mes}`.includes(t)
  ) return true;

  // Month names in pt-BR
  const mesIdx = parseInt(mes, 10) - 1;
  if (
    mesIdx >= 0
    && MESES_BUSCA[mesIdx]?.some((nome) => nome.startsWith(t) || t.startsWith(nome.substring(0, 3)))
  ) return true;

  return false;
}

function BuscaGlobal({
  transacoes,
  categorias,
  onFechar,
  onNavegar,
}: {
  transacoes: Transacao[];
  categorias: Categoria[];
  onFechar: () => void;
  onNavegar: (pagina: Pagina) => void;
}) {
  const [termo, setTermo] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar]);

  const resultados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (t.length < 2) return [];
    return transacoes
      .filter((tx) => matchesBusca(tx, t))
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 12);
  }, [termo, transacoes]);

  function handleClick(tx: Transacao) {
    onNavegar('transacoes');
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full max-w-xl mx-auto mt-16 lg:mt-24 px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-slate-900/95 px-4 py-3 shadow-2xl">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar por nome, data (dd/mm) ou valor..."
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
          {termo && (
            <button onClick={() => setTermo('')} className="text-slate-500 hover:text-slate-200">
              <X size={16} />
            </button>
          )}
          <kbd className="hidden lg:inline-flex shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        {termo.trim().length >= 2 && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl overflow-hidden">
            {resultados.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                Nenhuma transação encontrada para "{termo}"
              </div>
            ) : (
              <>
                <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide text-slate-600">
                  {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
                </div>
                <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
                  {resultados.map((tx) => {
                    const cat = categorias.find((c) => c.id === tx.categoria_id);
                    const [ano, mes, dia] = tx.data.split('-');
                    const dataFmt = `${dia}/${mes}/${ano}`;
                    return (
                      <button
                        key={tx.id}
                        type="button"
                        onClick={() => handleClick(tx)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/4 transition-colors text-left"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                          style={{ background: cat?.cor ? `${cat.cor}22` : 'rgba(255,255,255,0.06)' }}
                        >
                          {cat?.icone || '$'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{tx.descricao}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {dataFmt}
                            {cat?.nome ? ` · ${cat.nome}` : ''}
                            {tx.parcelas && tx.parcelas > 1 ? ` · ${tx.parcelas}x` : ''}
                          </div>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums shrink-0 ${tx.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {tx.tipo === 'receita' ? '+' : '−'}{formatarMoeda(tx.valor)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => { onNavegar('transacoes'); onFechar(); }}
                  className="w-full px-4 py-3 text-xs text-purple-400 hover:text-purple-300 hover:bg-white/3 transition-colors border-t border-white/5 text-left"
                >
                  Ver todos os resultados em Transações →
                </button>
              </>
            )}
          </div>
        )}

        {termo.trim().length < 2 && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-slate-900/95 px-4 py-4 text-[11px] text-slate-600 space-y-1">
            <p>💡 <span className="text-slate-500">Nome:</span> "mercado", "uber", "netflix"</p>
            <p>📅 <span className="text-slate-500">Data:</span> "15/05", "janeiro", "2026"</p>
            <p>💰 <span className="text-slate-500">Valor aprox.:</span> "150", "R$ 49,90"</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Desktop sidebar - all pages */
const navDesktop = [
  { id: 'dashboard',    label: 'Início',       icone: LayoutDashboard },
  { id: 'transacoes',   label: 'Transações',    icone: ArrowLeftRight  },
  { id: 'assistente',   label: 'Assistente IA', icone: Sparkles        },
  { id: 'agentes',      label: 'Agentes IA',    icone: BrainCircuit    },
  { id: 'patrimonio',   label: 'Patrimônio',    icone: TrendingUp      },
  { id: 'bancos',       label: 'Bancos',        icone: Building2       },
  { id: 'cartoes',      label: 'Cartões',       icone: CreditCard      },
  { id: 'relatorios',   label: 'Relatórios',    icone: BarChart3       },
  { id: 'orcamentos',   label: 'Orçamentos',    icone: Target          },
  { id: 'calendario',   label: 'Calendário',    icone: CalendarDays    },
  { id: 'investimentos',label: 'Investir',      icone: TrendingUp      },
] as const;

/** Mobile bottom nav - 4 primary + "Mais" button */
const navMobile = [
  { id: 'dashboard',  label: 'Início', icone: LayoutDashboard },
  { id: 'transacoes', label: 'Transações', icone: ArrowLeftRight  },
  { id: 'assistente', label: 'IA',     icone: Sparkles        },
  { id: 'bancos',     label: 'Bancos', icone: Building2       },
] as const;

/** Extra pages shown in the "Mais" bottom sheet */
const navMais = [
  { id: 'cartoes',      label: 'Cartões',    icone: CreditCard      },
  { id: 'patrimonio',   label: 'Patrimônio', icone: TrendingUp      },
  { id: 'relatorios',   label: 'Relatórios', icone: BarChart3       },
  { id: 'orcamentos',   label: 'Orçamentos', icone: Target          },
  { id: 'calendario',   label: 'Calendário', icone: CalendarDays    },
  { id: 'agentes',      label: 'Agentes IA', icone: BrainCircuit    },
  { id: 'investimentos',label: 'Investir',   icone: TrendingUp      },
  { id: 'configuracoes',label: 'Config.',    icone: Settings        },
] as const;

export default function AppPrincipal() {
  const [pagina, setPagina]           = useState<Pagina>('dashboard');
  const [modalAberto, setModalAberto] = useState(false);
  const [tipoInicialModal, setTipoInicialModal] = useState<TipoTransacao>('despesa');
  const [sincronizando, setSincronizando] = useState(false);
  const [maisAberto, setMaisAberto]   = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const { sincronizarDoSupabase, enviarParaNuvem, transacoes, categorias } = useFinanceiroStore();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setBuscaAberta(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const supabaseAtivo = isSupabaseConfigured();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('action');
      const page = params.get('page');
      const paginasValidas: Pagina[] = [
        'dashboard', 'transacoes', 'relatorios', 'investimentos', 'bancos', 'cartoes',
        'assistente', 'patrimonio', 'orcamentos', 'configuracoes', 'agentes', 'calendario',
      ];

      if (page && paginasValidas.includes(page as Pagina)) {
        setPagina(page as Pagina);
      }

      if (action === 'nova-despesa') {
        setTipoInicialModal('despesa');
        setModalAberto(true);
      } else if (action === 'nova-receita') {
        setTipoInicialModal('receita');
        setModalAberto(true);
      } else if (action === 'ver-gastos') {
        setPagina('transacoes');
      } else if (action === 'ver-cartoes') {
        setPagina('cartoes');
      }

      if (action || page) {
        const urlLimpa = `${window.location.pathname}${window.location.hash}`;
        window.history.replaceState({}, '', urlLimpa);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  function abrirModalNovaTransacao(tipo: TipoTransacao = 'despesa') {
    setTipoInicialModal(tipo);
    setModalAberto(true);
  }

  async function handleSync() {
    setSincronizando(true);
    const r = await sincronizarDoSupabase();
    setSincronizando(false);
    alert(r.msg);
  }

  async function handleEnviar() {
    setSincronizando(true);
    const r = await enviarParaNuvem();
    setSincronizando(false);
    alert(r.msg);
  }

  function renderizarPagina() {
    switch (pagina) {
      case 'dashboard':     return <Dashboard onNovoPagina={setPagina} />;
      case 'transacoes':    return <Transacoes />;
      case 'assistente':    return <Assistente />;
      case 'bancos':        return <Bancos />;
      case 'cartoes':       return <Cartoes />;
      case 'relatorios':    return <Relatorios />;
      case 'investimentos': return <Investimentos />;
      case 'patrimonio':    return <Patrimonio />;
      case 'orcamentos':    return <Orcamentos />;
      case 'agentes':       return <Agentes />;
      case 'calendario':    return <Calendario />;
      case 'configuracoes': return <Configuracoes />;
      default:              return <Dashboard onNovoPagina={setPagina} />;
    }
  }

  return (
    <div className="min-h-screen flex flex-col">

      {/* ===== DESKTOP LAYOUT (sidebar) ===== */}
      <div className="hidden lg:flex min-h-screen">

        {/* Sidebar */}
        <aside className="w-64 border-r border-white/[0.06] flex flex-col py-6 px-4 fixed h-full z-10 backdrop-blur-xl"
          style={{ background: 'rgba(10,14,26,0.85)' }}>

          {/* Logo */}
          <div className="flex items-center gap-3 px-2 mb-8">
            <img src={iconV2.src} alt="FinanceiroIA" className="w-9 h-9 rounded-xl shadow-lg shadow-purple-900/50" />
            <div>
              <h1 className="text-base font-bold text-white leading-tight">FinanceiroIA</h1>
              <p className="text-[11px] text-slate-500">Controle inteligente</p>
            </div>
          </div>

          {/* Search */}
          <button
            onClick={() => setBuscaAberta(true)}
            className="flex items-center gap-2.5 w-full mb-4 px-3 py-2 rounded-xl border border-white/10 bg-white/3 text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all text-sm"
          >
            <Search size={15} />
            <span className="flex-1 text-left text-xs">Buscar transação...</span>
            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px]">⌘K</kbd>
          </button>

          {/* Navigation */}
          <nav className="flex-1 space-y-0.5">
            {navDesktop.map(item => {
              const Icon = item.icone;
              const ativo = pagina === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setPagina(item.id as Pagina)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                    transition-all duration-150 text-left
                    ${ativo
                      ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                    }
                  `}
                >
                  <Icon size={18} strokeWidth={ativo ? 2.2 : 1.8} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Divider */}
          <div className="h-px bg-white/[0.06] my-3" />

          {/* Nova Transação CTA */}
          <button
            onClick={() => abrirModalNovaTransacao('despesa')}
            className="btn-primary flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold mb-2"
          >
            <Plus size={16} />
            Novo Lançamento
          </button>

          {/* Sync Supabase */}
          {supabaseAtivo && (
            <div className="flex gap-1.5 mb-1">
              <button onClick={handleSync} disabled={sincronizando} title="Baixar da nuvem"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 disabled:opacity-50 transition-all">
                {sincronizando ? <RefreshCw size={13} className="animate-spin" /> : <Cloud size={13} />}
                Baixar
              </button>
              <button onClick={handleEnviar} disabled={sincronizando} title="Enviar para nuvem"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-400 hover:text-purple-400 hover:border-purple-500/30 disabled:opacity-50 transition-all">
                <CloudOff size={13} />
                Enviar
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setPagina('configuracoes');
              window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent(FINANCEIRO_OPEN_BACKUP_EVENT));
              }, 50);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-400 hover:text-amber-300 hover:border-amber-500/30 transition-all mb-2"
          >
            <HardDrive size={13} />
            Backup
          </button>

          {/* Configurações */}
          <button
            onClick={() => setPagina('configuracoes')}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
              transition-all duration-150 text-left border border-transparent
              ${pagina === 'configuracoes'
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
              }
            `}
          >
            <Settings size={18} />
            Configurações
          </button>
        </aside>

        {/* Main content */}
        <main className="ml-64 flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-6">
            {renderizarPagina()}
          </div>
        </main>
      </div>

      {/* ===== MOBILE LAYOUT (bottom nav) ===== */}
      <div className="lg:hidden flex flex-col min-h-screen">

        {/* Mobile header */}
        <header className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md"
          style={{ background: 'rgba(10,14,26,0.95)' }}>
          <div className="flex items-center gap-2.5">
            <img src={iconV2.src} alt="FinanceiroIA" className="w-8 h-8 rounded-lg shadow-lg shadow-purple-900/40" />
            <h1 className="text-sm font-bold text-white">FinanceiroIA</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBuscaAberta(true)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
              aria-label="Buscar transação"
            >
              <Search size={18} />
            </button>
            <button
              onClick={() => abrirModalNovaTransacao('despesa')}
              className="btn-primary text-white p-2 rounded-xl"
              aria-label="Novo lançamento"
            >
              <Plus size={18} />
            </button>
          </div>
        </header>

        {/* Mobile content */}
        <main className="flex-1 overflow-y-auto pb-20">
          <div className="p-4">
            {renderizarPagina()}
          </div>
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] px-2 pt-2 pb-safe z-10 backdrop-blur-xl"
          style={{ background: 'rgba(10,14,26,0.92)' }}>
          <div className="flex justify-around max-w-md mx-auto">
            {navMobile.map(item => {
              const Icon = item.icone;
              const ativo = pagina === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setPagina(item.id as Pagina)}
                  className={`
                    flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl
                    transition-all duration-150 min-w-[52px]
                    ${ativo ? 'text-purple-400' : 'text-slate-600 hover:text-slate-400'}
                  `}
                  aria-label={item.label}
                >
                  <Icon size={21} strokeWidth={ativo ? 2.4 : 1.7} />
                  <span className={`text-[10px] font-medium ${ativo ? 'text-purple-400' : 'text-slate-600'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
            {/* Mais button */}
            <button
              onClick={() => setMaisAberto(true)}
              className={`
                flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl
                transition-all duration-150 min-w-[52px]
                ${maisAberto || navMais.some(i => i.id === pagina) ? 'text-purple-400' : 'text-slate-600 hover:text-slate-400'}
              `}
              aria-label="Mais páginas"
            >
              <MoreHorizontal size={21} strokeWidth={1.7} />
              <span className="text-[10px] font-medium">Mais</span>
            </button>
          </div>
        </nav>

        {/* "Mais" bottom sheet */}
        {maisAberto && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMaisAberto(false)} />
            <div className="relative rounded-t-2xl border-t border-white/[0.08] px-4 pt-4 pb-8 backdrop-blur-xl"
              style={{ background: 'rgba(10,14,26,0.97)' }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-slate-300">Todas as páginas</span>
                <button onClick={() => setMaisAberto(false)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-all">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {navMais.map(item => {
                  const Icon = item.icone;
                  const ativo = pagina === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setPagina(item.id as Pagina); setMaisAberto(false); }}
                      className={`
                        flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-150
                        ${ativo
                          ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                          : 'text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-slate-200'}
                      `}
                    >
                      <Icon size={22} strokeWidth={ativo ? 2.2 : 1.7} />
                      <span className="text-[11px] font-medium leading-tight text-center">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Busca Global */}
      {buscaAberta && (
        <BuscaGlobal
          transacoes={transacoes}
          categorias={categorias}
          onFechar={() => setBuscaAberta(false)}
          onNavegar={(p) => setPagina(p)}
        />
      )}

      {/* Modal */}
      <ModalNovaTransacao
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        tipoInicial={tipoInicialModal}
      />
    </div>
  );
}

