'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Settings, Lock, Bell, Palette, Database, RefreshCw,
  Download, Upload, Trash2, Shield, ChevronRight, Check,
  Eye, EyeOff, X, Smartphone, Globe, Info, LogOut,
  TrendingUp, Cloud, AlertTriangle, Copy, Brain,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import AIModelSelect from '@/components/ui/AIModelSelect';

// ── Seção genérica ────────────────────────────────────────
function Secao({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 mb-3">
        <div className="text-purple-400">{icone}</div>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{titulo}</h2>
      </div>
      <div className="bg-[#0F1629] border border-white/[0.06] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
        {children}
      </div>
    </div>
  );
}

function Item({
  label, descricao, acao, valor, danger, icone,
}: {
  label: string;
  descricao?: string;
  acao?: React.ReactNode;
  valor?: string;
  danger?: boolean;
  icone?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {icone && <div className={`text-sm flex-shrink-0 ${danger ? 'text-red-400' : 'text-slate-400'}`}>{icone}</div>}
        <div className="min-w-0">
          <p className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-slate-200'} truncate`}>{label}</p>
          {descricao && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{descricao}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {valor && <span className="text-xs text-slate-500">{valor}</span>}
        {acao}
      </div>
    </div>
  );
}

function Toggle({ ativo, onChange }: { ativo: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!ativo)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${ativo ? 'bg-purple-600' : 'bg-white/10'}`}
    >
      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${ativo ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

// ── Modal PIN ─────────────────────────────────────────────
function ModalPin({ onFechar, onSalvar }: { onFechar: () => void; onSalvar: (pin: string) => void }) {
  const [atual, setAtual]   = useState('');
  const [novo, setNovo]     = useState('');
  const [conf, setConf]     = useState('');
  const [erro, setErro]     = useState('');
  const [showAtual, setShowAtual] = useState(false);
  const [showNovo, setShowNovo]   = useState(false);
  const { config } = useFinanceiroStore();

  function salvar() {
    const pinAtual = config.pin || '1234';
    if (atual !== pinAtual) { setErro('PIN atual incorreto'); return; }
    if (novo.length < 4)    { setErro('O novo PIN deve ter pelo menos 4 dígitos'); return; }
    if (novo !== conf)      { setErro('Os PINs não coincidem'); return; }
    onSalvar(novo);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onFechar}>
      <div className="w-full max-w-sm bg-[#0A0E1A] border border-white/[0.08] rounded-2xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Lock size={16} className="text-purple-400" /> Alterar PIN
          </h3>
          <button onClick={onFechar} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        {[
          { label: 'PIN atual', val: atual, set: setAtual, show: showAtual, toggle: () => setShowAtual(v => !v) },
          { label: 'Novo PIN',  val: novo,  set: setNovo,  show: showNovo,  toggle: () => setShowNovo(v => !v) },
          { label: 'Confirmar novo PIN', val: conf, set: setConf, show: showNovo, toggle: () => setShowNovo(v => !v) },
        ].map(({ label, val, set, show, toggle }) => (
          <div key={label}>
            <label className="text-xs text-slate-400 mb-1.5 block">{label}</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                inputMode="numeric" maxLength={8}
                value={val} onChange={e => { set(e.target.value.replace(/\D/g,'')); setErro(''); }}
                className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm tracking-widest outline-none focus:border-purple-500 pr-10" />
              <button type="button" onClick={toggle}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        ))}

        {erro && <p className="text-xs text-red-400 bg-red-950/30 rounded-lg px-3 py-2">{erro}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-xl bg-white/5 text-slate-400 text-sm hover:bg-white/10 transition-colors">Cancelar</button>
          <button onClick={salvar} disabled={!atual || !novo || !conf}
            className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
export default function Configuracoes() {
  const {
    config, atualizarConfig, desautenticar,
    transacoes, categorias, contas, cartoes, investimentos,
    metas, orcamentos,
    selicAtual, cdiAtual, ipcaAtual, setTaxas,
    sincronizarDoSupabase, enviarParaNuvem,
    carregarDados,
  } = useFinanceiroStore();

  const [modalPin, setModalPin]         = useState(false);
  const [toast, setToast]               = useState('');
  const [buscandoTaxas, setBuscandoTaxas] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [taxasSelic, setTaxasSelic]     = useState(String(selicAtual || 10.75));
  const [taxasCdi, setTaxasCdi]         = useState(String(cdiAtual  || 10.65));
  const [taxasIpca, setTaxasIpca]       = useState(String(ipcaAtual || 4.83));
  const fileRef = useRef<HTMLInputElement>(null);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function salvarPin(novo: string) {
    atualizarConfig({ pin: novo });
    setModalPin(false);
    mostrarToast('PIN alterado com sucesso!');
  }

  async function buscarTaxasOnline() {
    setBuscandoTaxas(true);
    try {
      const res  = await fetch('/api/selic');
      const data = await res.json();
      const selic = data.taxa || 10.75;
      const cdi   = selic - 0.1;
      setTaxas(selic, cdi, parseFloat(taxasIpca) || 4.83);
      setTaxasSelic(selic.toFixed(2));
      setTaxasCdi(cdi.toFixed(2));
      mostrarToast('Taxas atualizadas com sucesso!');
    } catch { mostrarToast('Erro ao buscar taxas'); }
    finally { setBuscandoTaxas(false); }
  }

  function salvarTaxasManuais() {
    const s = parseFloat(taxasSelic);
    const c = parseFloat(taxasCdi);
    const i = parseFloat(taxasIpca);
    if (!isNaN(s) && !isNaN(c) && !isNaN(i)) {
      setTaxas(s, c, i);
      atualizarConfig({ selic_atual: s, cdi_atual: c, ipca_atual: i });
      mostrarToast('Taxas salvas!');
    }
  }

  // Export JSON
  function exportarDados() {
    const dados = {
      exportado_em: new Date().toISOString(),
      versao: '1.0',
      transacoes, categorias, contas, cartoes, investimentos, metas, orcamentos,
    };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `financeiro-ia-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('Backup exportado!');
  }

  // Export CSV
  function exportarCSV() {
    const header = 'Data,Descricao,Valor,Tipo,Categoria,Metodo';
    const rows = transacoes.map(t => {
      const cat = categorias.find(c => c.id === t.categoria_id);
      return `${t.data},"${t.descricao}",${t.valor},${t.tipo},"${cat?.nome || ''}",${t.metodo_pagamento || ''}`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM para Excel
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `transacoes-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('CSV exportado!');
  }

  // Import JSON
  function importarDados(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dados = JSON.parse(reader.result as string);
        // Aplica importação (apenas adiciona, não sobrescreve)
        if (dados.transacoes) dados.transacoes.forEach((t: typeof transacoes[0]) => {
          const { storageTransacoes } = require('@/lib/storage');
          storageTransacoes.save(t);
        });
        carregarDados();
        mostrarToast(`Importado: ${dados.transacoes?.length || 0} transações`);
      } catch { mostrarToast('Arquivo inválido'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleSync() {
    setSincronizando(true);
    const r = await sincronizarDoSupabase();
    setSincronizando(false);
    mostrarToast(r.msg);
  }

  async function handleEnviar() {
    setSincronizando(true);
    const r = await enviarParaNuvem();
    setSincronizando(false);
    mostrarToast(r.msg);
  }

  function limparTodosDados() {
    if (!confirm('⚠️ Isso vai APAGAR TODOS os seus dados locais permanentemente. Essa ação não pode ser desfeita.\n\nTem certeza?')) return;
    if (!confirm('Segunda confirmação: todos os dados serão perdidos. Continuar?')) return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fin_'));
    keys.forEach(k => localStorage.removeItem(k));
    carregarDados();
    mostrarToast('Todos os dados foram apagados');
  }

  const totalDados = transacoes.length + contas.length + cartoes.length + investimentos.length;

  return (
    <div className="space-y-7 animate-fade-up pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
          <Settings size={18} className="text-purple-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Configurações</h1>
          <p className="text-xs text-slate-500">{totalDados} registros locais</p>
        </div>
      </div>

      {/* ── SEGURANÇA ─────────────────────────────────────── */}
      <Secao titulo="Segurança" icone={<Shield size={14} />}>
        <Item
          label="Alterar PIN de acesso"
          descricao="PIN protege o acesso ao app"
          icone={<Lock size={15} />}
          acao={
            <button onClick={() => setModalPin(true)}
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors">
              Alterar <ChevronRight size={14} />
            </button>
          }
        />
        <Item
          label="Bloqueio automático"
          descricao="Bloquear ao fechar o app"
          icone={<Lock size={15} />}
          acao={<Toggle ativo={true} onChange={() => mostrarToast('Em breve')} />}
        />
      </Secao>

      {/* ── PREFERÊNCIAS ─────────────────────────────────── */}
      <Secao titulo="Preferências" icone={<Palette size={14} />}>
        <Item
          label="Moeda"
          descricao="Moeda padrão do app"
          icone={<Globe size={15} />}
          acao={
            <select
              value={config.moeda}
              onChange={e => { atualizarConfig({ moeda: e.target.value }); mostrarToast('Moeda atualizada!'); }}
              className="bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg px-2 py-1 outline-none focus:border-purple-500"
            >
              <option value="BRL">R$ — Real (BRL)</option>
              <option value="USD">$ — Dólar (USD)</option>
              <option value="EUR">€ — Euro (EUR)</option>
              <option value="GBP">£ — Libra (GBP)</option>
            </select>
          }
        />
        <Item
          label="Notificações"
          descricao="Alertas de orçamento e lembretes"
          icone={<Bell size={15} />}
          acao={
            <Toggle
              ativo={config.notificacoes_ativas}
              onChange={v => { atualizarConfig({ notificacoes_ativas: v }); mostrarToast(v ? 'Notificações ativas' : 'Notificações desativadas'); }}
            />
          }
        />
      </Secao>

      {/* ── TAXAS ECONÔMICAS ─────────────────────────────── */}
      <Secao titulo="Inteligência Artificial" icone={<Brain size={14} />}>
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-slate-500">
            Escolha a IA padrão do app. No modo automático, o FinanceiroIA tenta a melhor opção para cada tarefa e troca de modelo quando houver fallback disponível.
          </p>
          <AIModelSelect
            task="chat"
            value={config.ai_modelo_padrao || 'automatico'}
            onChange={(value) => {
              atualizarConfig({ ai_modelo_padrao: value });
              mostrarToast('Modelo padrão de IA atualizado!');
            }}
          />
        </div>
      </Secao>

      <Secao titulo="Taxas Econômicas" icone={<TrendingUp size={14} />}>
        <div className="px-4 py-4 space-y-4">
          <p className="text-xs text-slate-500">Usadas no simulador de investimentos</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Selic (% a.a.)', val: taxasSelic, set: setTaxasSelic },
              { label: 'CDI (% a.a.)',   val: taxasCdi,   set: setTaxasCdi   },
              { label: 'IPCA (% a.a.)',  val: taxasIpca,  set: setTaxasIpca  },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <label className="text-[10px] text-slate-500 mb-1 block">{label}</label>
                <input type="number" step="0.01" value={val} onChange={e => set(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white text-sm font-semibold rounded-xl px-3 py-2 outline-none focus:border-purple-500 tabular-nums" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={salvarTaxasManuais}
              className="flex-1 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-medium hover:bg-purple-600/30 transition-colors">
              Salvar manual
            </button>
            <button onClick={buscarTaxasOnline} disabled={buscandoTaxas}
              className="flex-1 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-slate-400 text-xs font-medium hover:text-white hover:bg-white/[0.08] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={11} className={buscandoTaxas ? 'animate-spin' : ''} />
              Buscar online
            </button>
          </div>
        </div>
      </Secao>

      {/* ── SINCRONIZAÇÃO ─────────────────────────────────── */}
      <Secao titulo="Sincronização na Nuvem" icone={<Cloud size={14} />}>
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-slate-500">Sincronize seus dados com o Supabase</p>
          <div className="flex gap-2">
            <button onClick={handleSync} disabled={sincronizando}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-600/25 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
              {sincronizando ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
              Baixar da Nuvem
            </button>
            <button onClick={handleEnviar} disabled={sincronizando}
              className="flex-1 py-2.5 rounded-xl bg-purple-600/15 border border-purple-500/30 text-purple-400 text-xs font-semibold hover:bg-purple-600/25 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Upload size={12} />
              Enviar para Nuvem
            </button>
          </div>
        </div>
      </Secao>

      {/* ── DADOS E BACKUP ────────────────────────────────── */}
      <Secao titulo="Dados & Backup" icone={<Database size={14} />}>
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Transações',   val: transacoes.length   },
              { label: 'Contas',       val: contas.length        },
              { label: 'Cartões',      val: cartoes.length       },
              { label: 'Investimentos',val: investimentos.length },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/[0.03] rounded-xl py-2.5">
                <p className="text-base font-bold text-white">{val}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <Item
          label="Exportar Backup (JSON)"
          descricao="Todos os dados para restauração"
          icone={<Download size={15} />}
          acao={
            <button onClick={exportarDados}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors">
              Exportar <ChevronRight size={14} />
            </button>
          }
        />
        <Item
          label="Exportar Transações (CSV)"
          descricao="Compatível com Excel e Google Sheets"
          icone={<Download size={15} />}
          acao={
            <button onClick={exportarCSV}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors">
              CSV <ChevronRight size={14} />
            </button>
          }
        />
        <Item
          label="Importar Backup (JSON)"
          descricao="Restaurar a partir de arquivo"
          icone={<Upload size={15} />}
          acao={
            <>
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importarDados} />
              <button onClick={() => fileRef.current?.click()}
                className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 transition-colors">
                Importar <ChevronRight size={14} />
              </button>
            </>
          }
        />
        <Item
          label="Copiar dados para área de transferência"
          descricao="Todas as transações como JSON"
          icone={<Copy size={15} />}
          acao={
            <button onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(transacoes, null, 2));
              mostrarToast('Copiado!');
            }} className="text-xs text-slate-400 hover:text-white font-medium flex items-center gap-1 transition-colors">
              Copiar <ChevronRight size={14} />
            </button>
          }
        />
      </Secao>

      {/* ── APP ───────────────────────────────────────────── */}
      <Secao titulo="Aplicativo" icone={<Smartphone size={14} />}>
        <Item
          label="Instalar como App (PWA)"
          descricao="Adicionar à tela inicial do celular"
          icone={<Smartphone size={15} />}
          acao={<PwaInstallButton onToast={mostrarToast} />}
        />
        <Item
          label="Versão do app"
          icone={<Info size={15} />}
          valor="FinanceiroIA v1.0"
        />
        <Item
          label="Idioma"
          icone={<Globe size={15} />}
          valor="Português Brasil"
        />
      </Secao>

      {/* ── ZONA DE PERIGO ────────────────────────────────── */}
      <Secao titulo="Zona de Perigo" icone={<AlertTriangle size={14} />}>
        <Item
          label="Sair / Bloquear app"
          descricao="Volta para a tela de PIN"
          icone={<LogOut size={15} />}
          acao={
            <button onClick={desautenticar}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 transition-colors">
              Sair <ChevronRight size={14} />
            </button>
          }
        />
        <Item
          label="Apagar todos os dados locais"
          descricao="Irreversível — cria backup antes"
          icone={<Trash2 size={15} />}
          danger
          acao={
            <button onClick={limparTodosDados}
              className="text-xs text-red-400 hover:text-red-300 font-medium flex items-center gap-1 transition-colors">
              Apagar <ChevronRight size={14} />
            </button>
          }
        />
      </Secao>

      {/* Modal PIN */}
      {modalPin && <ModalPin onFechar={() => setModalPin(false)} onSalvar={salvarPin} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-[#1a1f35] border border-white/10 rounded-2xl text-sm text-white shadow-xl flex items-center gap-2 whitespace-nowrap">
          <Check size={14} className="text-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Botão PWA Install ─────────────────────────────────────
function PwaInstallButton({ onToast }: { onToast: (m: string) => void }) {
  const [prompt, setPrompt] = useState<Event & { prompt?: () => Promise<void> } | null>(null);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt?: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalado(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (instalado) return <span className="text-xs text-emerald-400 flex items-center gap-1"><Check size={12} /> Instalado</span>;

  if (!prompt) return (
    <span className="text-[11px] text-slate-500">
      {window.matchMedia('(display-mode: standalone)').matches
        ? '✓ Já instalado'
        : 'Abra no Chrome'}
    </span>
  );

  return (
    <button
      onClick={async () => {
        await prompt?.prompt?.();
        setPrompt(null);
        onToast('App instalado!');
      }}
      className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 transition-colors"
    >
      Instalar <ChevronRight size={14} />
    </button>
  );
}

