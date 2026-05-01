'use client';

import { useState } from 'react';
import {
  LayoutDashboard, ArrowLeftRight, BarChart3, TrendingUp,
  Settings, Plus, Building2, CreditCard, Cloud, CloudOff, RefreshCw, Sparkles,
  Target, Repeat, BrainCircuit, CalendarDays, MoreHorizontal, X,
} from 'lucide-react';
import Dashboard      from '@/components/paginas/Dashboard';
import Transacoes     from '@/components/paginas/Transacoes';
import Relatorios     from '@/components/paginas/Relatorios';
import Investimentos  from '@/components/paginas/Investimentos';
import Bancos         from '@/components/paginas/Bancos';
import Cartoes        from '@/components/paginas/Cartoes';
import Assistente     from '@/components/paginas/Assistente';
import Patrimonio     from '@/components/paginas/Patrimonio';
import Orcamentos     from '@/components/paginas/Orcamentos';
import Assinaturas    from '@/components/paginas/Assinaturas';
import Agentes        from '@/components/paginas/Agentes';
import Calendario     from '@/components/paginas/Calendario';
import Configuracoes  from '@/components/paginas/Configuracoes';
import ModalNovaTransacao from '@/components/modais/ModalNovaTransacao';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { isSupabaseConfigured } from '@/lib/supabase';

type Pagina = 'dashboard' | 'transacoes' | 'relatorios' | 'investimentos' | 'bancos' | 'cartoes' | 'assistente' | 'patrimonio' | 'orcamentos' | 'assinaturas' | 'configuracoes' | 'agentes' | 'calendario';

/** Desktop sidebar — all pages */
const navDesktop = [
  { id: 'dashboard',    label: 'Início',       icone: LayoutDashboard },
  { id: 'transacoes',   label: 'Gastos',        icone: ArrowLeftRight  },
  { id: 'assistente',   label: 'Assistente IA', icone: Sparkles        },
  { id: 'agentes',      label: 'Agentes IA',    icone: BrainCircuit    },
  { id: 'patrimonio',   label: 'Patrimônio',    icone: TrendingUp      },
  { id: 'bancos',       label: 'Bancos',        icone: Building2       },
  { id: 'cartoes',      label: 'Cartões',       icone: CreditCard      },
  { id: 'relatorios',   label: 'Relatórios',    icone: BarChart3       },
  { id: 'orcamentos',   label: 'Orçamentos',    icone: Target          },
  { id: 'assinaturas',  label: 'Assinaturas',   icone: Repeat          },
  { id: 'calendario',   label: 'Calendário',    icone: CalendarDays    },
  { id: 'investimentos',label: 'Investir',      icone: TrendingUp      },
] as const;

/** Mobile bottom nav — 4 primary + "Mais" button */
const navMobile = [
  { id: 'dashboard',  label: 'Início', icone: LayoutDashboard },
  { id: 'transacoes', label: 'Gastos', icone: ArrowLeftRight  },
  { id: 'assistente', label: 'IA',     icone: Sparkles        },
  { id: 'bancos',     label: 'Bancos', icone: Building2       },
] as const;

/** Extra pages shown in the "Mais" bottom sheet */
const navMais = [
  { id: 'cartoes',      label: 'Cartões',    icone: CreditCard      },
  { id: 'patrimonio',   label: 'Patrimônio', icone: TrendingUp      },
  { id: 'relatorios',   label: 'Relatórios', icone: BarChart3       },
  { id: 'orcamentos',   label: 'Orçamentos', icone: Target          },
  { id: 'assinaturas',  label: 'Assinaturas',icone: Repeat          },
  { id: 'calendario',   label: 'Calendário', icone: CalendarDays    },
  { id: 'agentes',      label: 'Agentes IA', icone: BrainCircuit    },
  { id: 'investimentos',label: 'Investir',   icone: TrendingUp      },
  { id: 'configuracoes',label: 'Config.',    icone: Settings        },
] as const;

export default function AppPrincipal() {
  const [pagina, setPagina]           = useState<Pagina>('dashboard');
  const [modalAberto, setModalAberto] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [maisAberto, setMaisAberto]   = useState(false);
  const { sincronizarDoSupabase, enviarParaNuvem } = useFinanceiroStore();
  const supabaseAtivo = isSupabaseConfigured();

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
      case 'assinaturas':   return <Assinaturas />;
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
            <img src="/icons/icon-96x96.png" alt="FinanceiroIA" className="w-9 h-9 rounded-xl shadow-lg shadow-purple-900/50" />
            <div>
              <h1 className="text-base font-bold text-white leading-tight">FinanceiroIA</h1>
              <p className="text-[11px] text-slate-500">Controle inteligente</p>
            </div>
          </div>

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
            onClick={() => setModalAberto(true)}
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
            <img src="/icons/icon-96x96.png" alt="FinanceiroIA" className="w-8 h-8 rounded-lg shadow-lg shadow-purple-900/40" />
            <h1 className="text-sm font-bold text-white">FinanceiroIA</h1>
          </div>
          <button
            onClick={() => setModalAberto(true)}
            className="btn-primary text-white p-2 rounded-xl"
            aria-label="Novo lançamento"
          >
            <Plus size={18} />
          </button>
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

      {/* Modal */}
      <ModalNovaTransacao
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
      />
    </div>
  );
}
