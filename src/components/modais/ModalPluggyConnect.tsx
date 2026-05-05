'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Loader2, AlertCircle, Wifi } from 'lucide-react';
import usePluggyConnect from 'use-pluggy-connect';
import type { SyncResult } from '@/app/api/pluggy/sync/route';

/* ── Tipos ──────────────────────────────────────────────────────────────────── */

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onSincronizado: (resultado: SyncResult) => void;
}

type Etapa = 'carregando' | 'widget' | 'sincronizando' | 'sucesso' | 'erro';

/* ── Inner widget (hook must live here so token is always defined) ─────────── */

interface WidgetProps {
  connectToken: string;
  onFechar: () => void;
  onEtapa: (e: Etapa) => void;
  onMsg: (m: string) => void;
  onResultado: (r: SyncResult) => void;
}

function PluggyWidget({ connectToken, onFechar, onEtapa, onMsg, onResultado }: WidgetProps) {
  // Guarda a etapa atual para o onClose saber se deve fechar ou não
  const etapaRef = useRef<Etapa>('carregando');

  const { init, ready, error } = usePluggyConnect({
    connectToken,
    includeSandbox: true, // mostra sandbox até aprovação da produção Pluggy
    theme: 'dark',
    onSuccess: async (data) => {
      etapaRef.current = 'sincronizando';
      onEtapa('sincronizando');
      onMsg('Importando dados bancários...');
      try {
        const res = await fetch('/api/pluggy/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: data.item.id }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error ?? 'Falha ao sincronizar dados');
        }
        const syncData = await res.json() as SyncResult;
        onResultado(syncData);
        etapaRef.current = 'sucesso';
        onEtapa('sucesso');
      } catch (e) {
        onMsg(e instanceof Error ? e.message : 'Erro ao sincronizar');
        etapaRef.current = 'erro';
        onEtapa('erro');
      }
    },
    onError: (e) => {
      onMsg(e.message ?? 'Erro ao conectar com o banco. Tente novamente.');
      etapaRef.current = 'erro';
      onEtapa('erro');
    },
    // Só fecha o modal se o usuário cancelou (não depois de conectar com sucesso)
    onClose: () => {
      if (etapaRef.current === 'widget' || etapaRef.current === 'carregando') {
        onFechar();
      }
    },
  });

  // Open the widget as soon as it's ready
  useEffect(() => {
    if (ready) {
      onEtapa('widget');
      init();
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Surface hook-level errors
  useEffect(() => {
    if (error) {
      onMsg(error.message);
      onEtapa('erro');
    }
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // the widget renders itself as a full-screen overlay
}

/* ── Main modal ─────────────────────────────────────────────────────────────── */

export default function ModalPluggyConnect({ aberto, onFechar, onSincronizado }: Props) {
  const [etapa,     setEtapa]     = useState<Etapa>('carregando');
  const [msg,       setMsg]       = useState('');
  const [resultado, setResultado] = useState<SyncResult | null>(null);
  const [token,     setToken]     = useState<string | null>(null);

  // Fetch connect token whenever the modal opens
  const buscarToken = useCallback(async () => {
    setEtapa('carregando');
    setMsg('');
    setToken(null);
    setResultado(null);
    try {
      const res = await fetch('/api/pluggy/connect-token', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Erro ao gerar token de conexão');
      }
      const { connectToken } = await res.json() as { connectToken: string };
      setToken(connectToken);
      // etapa transitions to 'widget' once PluggyWidget reports ready
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro desconhecido');
      setEtapa('erro');
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const timeout = window.setTimeout(() => {
      buscarToken();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [aberto, buscarToken]);

  function handleConfirmar() {
    if (resultado) onSincronizado(resultado);
    onFechar();
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {/* Pluggy Connect widget mounts invisibly here once we have a token */}
      {token && (
        <PluggyWidget
          connectToken={token}
          onFechar={onFechar}
          onEtapa={setEtapa}
          onMsg={setMsg}
          onResultado={setResultado}
        />
      )}

      <div className="bg-[#0F1629] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
              <Wifi size={18} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Conectar Banco</h3>
              <p className="text-[11px] text-slate-500">Open Finance — Pluggy</p>
            </div>
          </div>
          {(etapa === 'erro' || etapa === 'sucesso') && (
            <button
              onClick={onFechar}
              className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Conteúdo */}
        <div className="p-6 text-center">

          {/* Carregando token ou aguardando hook */}
          {etapa === 'carregando' && (
            <div className="py-4">
              <Loader2 size={36} className="animate-spin text-purple-400 mx-auto mb-4" />
              <p className="text-slate-300 text-sm font-medium">Iniciando conexão bancária...</p>
              <p className="text-slate-600 text-xs mt-1">Preparando Pluggy Connect</p>
            </div>
          )}

          {/* Widget aberto (overlay é do Pluggy, aqui só feedback) */}
          {etapa === 'widget' && (
            <div className="py-4">
              <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-4">
                <Wifi size={22} className="text-purple-400" />
              </div>
              <p className="text-slate-300 text-sm font-medium">Selecione seu banco no widget</p>
              <p className="text-slate-500 text-xs mt-1">O Pluggy Connect foi aberto como overlay</p>
            </div>
          )}

          {/* Sincronizando */}
          {etapa === 'sincronizando' && (
            <div className="py-4">
              <Loader2 size={36} className="animate-spin text-emerald-400 mx-auto mb-4" />
              <p className="text-slate-300 text-sm font-medium">{msg}</p>
              <p className="text-slate-600 text-xs mt-1">Buscando saldos, transações e investimentos...</p>
            </div>
          )}

          {/* Sucesso */}
          {etapa === 'sucesso' && resultado && (
            <div className="py-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-white font-semibold text-base mb-1">{resultado.bancaNome} conectado!</p>
              <div className="mt-4 space-y-2 text-left bg-white/[0.03] rounded-xl p-4 text-sm">
                {resultado.contas.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Contas bancárias</span>
                    <span className="text-white font-medium">{resultado.contas.length}</span>
                  </div>
                )}
                {resultado.cartoes.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cartões de crédito</span>
                    <span className="text-white font-medium">{resultado.cartoes.length}</span>
                  </div>
                )}
                {resultado.transacoes.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Transações (60 dias)</span>
                    <span className="text-white font-medium">{resultado.transacoes.length}</span>
                  </div>
                )}
                {resultado.investimentos.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Investimentos</span>
                    <span className="text-white font-medium">{resultado.investimentos.length}</span>
                  </div>
                )}
                {resultado.emprestimos.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Empréstimos</span>
                    <span className="text-white font-medium">{resultado.emprestimos.length}</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleConfirmar}
                className="w-full mt-5 btn-primary text-white py-3 rounded-xl text-sm font-semibold"
              >
                Importar para o app
              </button>
            </div>
          )}

          {/* Erro */}
          {etapa === 'erro' && (
            <div className="py-4">
              <AlertCircle size={36} className="text-red-400 mx-auto mb-4" />
              <p className="text-red-400 text-sm font-medium mb-1">Não foi possível conectar</p>
              <p className="text-slate-500 text-xs">{msg}</p>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={buscarToken}
                  className="flex-1 btn-primary text-white py-2.5 rounded-xl text-sm font-semibold"
                >
                  Tentar novamente
                </button>
                <button
                  onClick={onFechar}
                  className="flex-1 bg-white/5 text-slate-400 py-2.5 rounded-xl text-sm hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        {(etapa === 'carregando' || etapa === 'widget') && (
          <div className="px-5 pb-4 text-center">
            <p className="text-slate-600 text-[11px]">
              🔒 Conexão segura via Open Finance Brasil. Seus dados bancários nunca passam pelo FinanceiroIA.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
