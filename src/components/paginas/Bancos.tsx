'use client';

import { useState, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Building2, ArrowUpRight, ArrowDownLeft,
  Check, X, Wifi, WifiOff, RefreshCw, AlertCircle,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda, mesAtual, gerarId } from '@/lib/storage';
import { BANCO_INFO, BancoSlug, TipoConta, ContaBancaria, CartaoCredito, Transacao } from '@/types';
import ModalPluggyConnect from '@/components/modais/ModalPluggyConnect';
import type { SyncResult } from '@/app/api/pluggy/sync/route';

const BANCOS_LISTA = Object.entries(BANCO_INFO) as [BancoSlug, typeof BANCO_INFO[BancoSlug]][];
const TIPOS_CONTA: TipoConta[] = ['corrente', 'poupanca', 'digital', 'investimento'];

export default function Bancos() {
  const {
    contas, transacoes, categorias,
    atualizarSaldoConta, adicionarConta, excluirConta,
    adicionarCartao, adicionarTransacao,
  } = useFinanceiroStore();
  const { mes, ano } = mesAtual();

  const [editandoId, setEditandoId]     = useState<string | null>(null);
  const [novoSaldo, setNovoSaldo]       = useState('');
  const [mostrarForm, setMostrarForm]   = useState(false);
  const [contaSel, setContaSel]         = useState<string | null>(null);
  const [modalPluggy, setModalPluggy]   = useState(false);
  const [sincronizando, setSincronizando] = useState<string | null>(null); // itemId em sync

  const [form, setForm] = useState({
    banco: 'outro' as BancoSlug,
    nome: '',
    tipo: 'corrente' as TipoConta,
    saldo: '',
  });

  // Transações do mês por conta
  const transacoesPorConta = useMemo(() => {
    const doMes = transacoes.filter(t => {
      const d = new Date(t.data);
      return d.getMonth() + 1 === mes && d.getFullYear() === ano;
    });
    const mapa: Record<string, typeof doMes> = {};
    doMes.forEach(t => {
      const chave = t.conta_id || 'sem-conta';
      mapa[chave] = [...(mapa[chave] || []), t];
    });
    return mapa;
  }, [transacoes, mes, ano]);

  // Items Pluggy conectados (unique item IDs)
  const itemsConectados = useMemo(() => {
    const ids = new Set<string>();
    contas.forEach(c => { if (c.pluggy_item_id) ids.add(c.pluggy_item_id); });
    return ids;
  }, [contas]);

  function handleSalvarSaldo(id: string) {
    const val = parseFloat(novoSaldo.replace(',', '.'));
    if (!isNaN(val)) atualizarSaldoConta(id, val);
    setEditandoId(null);
    setNovoSaldo('');
  }

  function handleAdicionarConta(e: React.FormEvent) {
    e.preventDefault();
    adicionarConta({
      banco: form.banco,
      nome: form.nome || BANCO_INFO[form.banco].nome,
      tipo: form.tipo,
      saldo: parseFloat(form.saldo.replace(',', '.')) || 0,
    });
    setForm({ banco: 'outro', nome: '', tipo: 'corrente', saldo: '' });
    setMostrarForm(false);
  }

  // Importa resultado Pluggy para o store
  function handlePluggySincronizado(resultado: SyncResult) {
    const agora = new Date().toISOString();

    // 1. Contas bancárias
    resultado.contas.forEach(c => {
      const existente = contas.find(ct => ct.pluggy_account_id === c.pluggy_account_id);
      if (existente) {
        atualizarSaldoConta(existente.id, c.saldo);
      } else {
        adicionarConta({
          banco: c.banco,
          nome: c.nome,
          tipo: c.tipo as TipoConta,
          saldo: c.saldo,
          pluggy_item_id: c.pluggy_item_id,
          pluggy_account_id: c.pluggy_account_id,
          pluggy_sync_em: agora,
        } as Omit<ContaBancaria, 'id' | 'criado_em'>);
      }
    });

    // 2. Cartões de crédito
    resultado.cartoes.forEach(c => {
      adicionarCartao({
        banco: c.banco,
        nome: c.nome,
        bandeira: c.bandeira,
        limite: c.limite,
        fatura_atual: c.fatura_atual,
        dia_vencimento: c.dia_vencimento,
        dia_fechamento: c.dia_fechamento,
        pluggy_item_id: c.pluggy_item_id,
        pluggy_account_id: c.pluggy_account_id,
        pluggy_sync_em: agora,
      } as Omit<CartaoCredito, 'id' | 'criado_em'>);
    });

    // 3. Transações (apenas as que não existem ainda)
    const idsExistentes = new Set(transacoes.map(t => t.id));
    resultado.transacoes.forEach(tx => {
      const txId = `pluggy-${tx.pluggy_id}`;
      if (idsExistentes.has(txId)) return;
      // Encontra conta local vinculada
      const contaLocal = contas.find(ct => ct.pluggy_account_id === tx.pluggy_account_id);
      adicionarTransacao({
        valor: tx.valor,
        descricao: tx.descricao,
        categoria_id: tx.categoria_id,
        data: tx.data,
        tipo: tx.tipo,
        metodo_pagamento: tx.metodo_pagamento as 'pix' | 'debito' | 'credito' | 'dinheiro' | 'transferencia' | 'outro',
        conta_id: contaLocal?.id,
        origem: 'open_banking',
      } as Omit<Transacao, 'id' | 'criado_em'>);
    });
  }

  // Re-sincroniza um item Pluggy já conectado
  async function handleResync(itemId: string) {
    setSincronizando(itemId);
    try {
      const res = await fetch('/api/pluggy/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) throw new Error('Falha na sincronização');
      const data = await res.json() as SyncResult;
      handlePluggySincronizado(data);
    } catch (e) {
      alert('Erro ao ressincronizar: ' + (e instanceof Error ? e.message : 'Erro'));
    } finally {
      setSincronizando(null);
    }
  }

  // Desconecta um item Pluggy
  async function handleDesconectar(itemId: string) {
    if (!confirm('Desconectar este banco? As contas e transações importadas serão mantidas.')) return;
    await fetch('/api/pluggy/disconnect', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    // Remove pluggy_item_id das contas locais (sem excluir a conta)
    // Por ora apenas mostramos que foi desconectado
  }

  const totalContas  = contas.reduce((s, c) => s + c.saldo, 0);
  const contaDetalhes = contaSel ? contas.find(c => c.id === contaSel) : null;

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Contas Bancárias</h2>
          <p className="text-slate-500 text-sm">
            Total: <span className="text-emerald-400 font-semibold tabular-nums">{formatarMoeda(totalContas)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Botão Open Finance */}
          <button
            onClick={() => setModalPluggy(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/25 transition-all"
          >
            <Wifi size={14} />
            <span className="hidden sm:inline">Conectar</span>
          </button>
          <button
            onClick={() => setMostrarForm(v => !v)}
            className="btn-primary flex items-center gap-2 text-white px-3 py-2 rounded-xl text-sm font-medium"
          >
            <Plus size={16} /> Nova Conta
          </button>
        </div>
      </div>

      {/* Banner Open Finance (quando há contas conectadas) */}
      {itemsConectados.size > 0 && (
        <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-800/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Wifi size={15} className="text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400 text-xs font-medium">
              {itemsConectados.size} banco{itemsConectados.size > 1 ? 's' : ''} conectado{itemsConectados.size > 1 ? 's' : ''} via Open Finance
            </p>
          </div>
          <div className="flex gap-2">
            {Array.from(itemsConectados).map(itemId => (
              <div key={itemId} className="flex items-center gap-1">
                <button
                  onClick={() => handleResync(itemId)}
                  disabled={sincronizando === itemId}
                  title="Ressincronizar"
                  className="text-emerald-500 hover:text-emerald-300 p-1 rounded-lg hover:bg-emerald-900/20 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={13} className={sincronizando === itemId ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => handleDesconectar(itemId)}
                  title="Desconectar"
                  className="text-slate-600 hover:text-red-400 p-1 rounded-lg hover:bg-red-900/20 transition-colors"
                >
                  <WifiOff size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulário manual */}
      {mostrarForm && (
        <form onSubmit={handleAdicionarConta} className="glass-card p-5 space-y-4 border-purple-500/30">
          <h3 className="text-sm font-semibold text-purple-300">Adicionar Conta</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Banco *</label>
              <select value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value as BancoSlug }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500">
                {BANCOS_LISTA.map(([slug, info]) => (
                  <option key={slug} value={slug}>{info.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Tipo</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoConta }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500">
                {TIPOS_CONTA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nome (opcional)</label>
              <input type="text" placeholder={BANCO_INFO[form.banco].nome}
                value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Saldo atual (R$)</label>
              <input type="number" placeholder="0,00" step="0.01"
                value={form.saldo} onChange={e => setForm(f => ({ ...f, saldo: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 text-white py-2.5 rounded-xl text-sm font-semibold">Salvar</button>
            <button type="button" onClick={() => setMostrarForm(false)}
              className="px-4 bg-white/5 text-slate-400 py-2.5 rounded-xl text-sm hover:bg-white/10 transition-colors">Cancelar</button>
          </div>
        </form>
      )}

      {/* Cards das contas */}
      <div className="space-y-3">
        {contas.length === 0 && (
          <div className="glass-card flex flex-col items-center justify-center py-14 text-slate-600">
            <Building2 size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">Nenhuma conta cadastrada</p>
            <p className="text-xs mt-1">Conecte seu banco via Open Finance ou crie manualmente</p>
          </div>
        )}

        {contas.map(conta => {
          const info    = BANCO_INFO[conta.banco];
          const txConta = transacoesPorConta[conta.id] || [];
          const recMes  = txConta.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
          const despMes = txConta.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
          const isEdit  = editandoId === conta.id;
          const isOpen  = contaSel === conta.id;
          const conectado = !!conta.pluggy_item_id;

          return (
            <div key={conta.id} className="glass-card overflow-hidden">
              <div className="h-[3px]" style={{ background: info.cor }} />
              <div className="p-5">

                {/* Linha principal */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ background: info.cor }}>
                      {info.nome.slice(0, 2).toUpperCase()}
                    </div>
                    {conectado && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-[#0F1629]">
                        <Wifi size={8} className="text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{info.nome}</div>
                    <div className="text-xs text-slate-500 capitalize">
                      {conta.tipo} • {conta.nome}
                      {conectado && <span className="ml-1 text-emerald-500">• Open Finance</span>}
                    </div>
                  </div>

                  {/* Saldo */}
                  {isEdit ? (
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" autoFocus
                        value={novoSaldo} onChange={e => setNovoSaldo(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSalvarSaldo(conta.id)}
                        placeholder={conta.saldo.toString()}
                        className="w-28 bg-white/10 border border-white/20 text-white text-sm rounded-lg px-2 py-1.5 outline-none focus:border-purple-500 tabular-nums" />
                      <button onClick={() => handleSalvarSaldo(conta.id)} className="text-emerald-400 hover:text-emerald-300 p-1 rounded-lg hover:bg-emerald-900/20 transition-colors">
                        <Check size={16} />
                      </button>
                      <button onClick={() => setEditandoId(null)} className="text-slate-500 hover:text-slate-300 p-1 rounded-lg transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-lg font-bold tabular-nums" style={{ color: conta.saldo >= 0 ? '#F1F5F9' : '#EF4444' }}>
                          {formatarMoeda(conta.saldo)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {conectado && conta.pluggy_sync_em
                            ? `sync ${new Date(conta.pluggy_sync_em).toLocaleDateString('pt-BR')}`
                            : 'saldo atual'}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {!conectado && (
                          <button onClick={() => { setEditandoId(conta.id); setNovoSaldo(conta.saldo.toString()); }}
                            className="text-slate-500 hover:text-purple-400 p-1.5 rounded-lg hover:bg-purple-900/20 transition-colors" aria-label="Editar saldo">
                            <Pencil size={14} />
                          </button>
                        )}
                        <button onClick={() => confirm('Excluir esta conta?') && excluirConta(conta.id)}
                          className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-900/20 transition-colors" aria-label="Excluir conta">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mini stats */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <div className="text-emerald-400 text-sm font-semibold tabular-nums">{formatarMoeda(recMes)}</div>
                    <div className="text-slate-600 text-[11px] mt-0.5">Entradas/mês</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <div className="text-red-400 text-sm font-semibold tabular-nums">{formatarMoeda(despMes)}</div>
                    <div className="text-slate-600 text-[11px] mt-0.5">Saídas/mês</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <div className="text-slate-300 text-sm font-semibold">{txConta.length}</div>
                    <div className="text-slate-600 text-[11px] mt-0.5">Transações</div>
                  </div>
                </div>

                {txConta.length > 0 && (
                  <button onClick={() => setContaSel(isOpen ? null : conta.id)}
                    className="mt-3 w-full text-xs text-slate-500 hover:text-purple-400 text-center transition-colors py-1">
                    {isOpen ? 'Ocultar ▲' : `Ver ${txConta.length} transações ▼`}
                  </button>
                )}
              </div>

              {/* Transações expandidas */}
              {isOpen && (
                <div className="border-t border-white/[0.05] px-5 pb-4 space-y-2 mt-2">
                  {txConta.slice(0, 8).map(t => {
                    const cat = categorias.find(c => c.id === t.categoria_id);
                    return (
                      <div key={t.id} className="flex items-center gap-3">
                        <div className="w-1 h-6 rounded-full flex-shrink-0"
                          style={{ background: t.tipo === 'receita' ? '#10B981' : '#EF4444' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-300 truncate">{t.descricao}</div>
                          <div className="text-[11px] text-slate-600">{cat?.nome} • {new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
                        </div>
                        <div className={`text-xs font-semibold tabular-nums ${t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.tipo === 'receita' ? '+' : '-'}{formatarMoeda(t.valor)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Pluggy Connect */}
      <ModalPluggyConnect
        aberto={modalPluggy}
        onFechar={() => setModalPluggy(false)}
        onSincronizado={handlePluggySincronizado}
      />
    </div>
  );
}
