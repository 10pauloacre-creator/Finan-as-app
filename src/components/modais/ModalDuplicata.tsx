'use client';

import { AlertTriangle, X } from 'lucide-react';
import type { Transacao } from '@/types';

interface Props {
  transacaoExistente: Transacao;
  onConfirmar: () => void;
  onCancelar: () => void;
}

function formatBRL(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatData(data: string) {
  const [y, m, d] = data.split('-');
  return `${d}/${m}/${y}`;
}

export default function ModalDuplicata({ transacaoExistente: tx, onConfirmar, onCancelar }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancelar} />

      {/* Card */}
      <div className="relative bg-[#0F1629] border border-amber-500/30 rounded-2xl w-full max-w-sm shadow-2xl z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-amber-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Registro semelhante</h3>
              <p className="text-[11px] text-slate-500">Possível duplicata encontrada</p>
            </div>
          </div>
          <button
            onClick={onCancelar}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Transação existente */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-slate-400 leading-relaxed">
            Já existe um registro semelhante. Deseja adicionar mesmo assim?
          </p>

          <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/20 px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-white leading-tight flex-1">{tx.descricao}</p>
              <p className="text-sm font-bold text-amber-400 whitespace-nowrap">{formatBRL(tx.valor)}</p>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span>📅 {formatData(tx.data)}</span>
              {tx.categoria_id && <span>📂 {tx.categoria_id}</span>}
              {tx.metodo_pagamento && (
                <span>💳 {tx.metodo_pagamento.charAt(0).toUpperCase() + tx.metodo_pagamento.slice(1)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancelar}
            className="flex-1 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="flex-1 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-semibold transition-all"
          >
            Adicionar mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}
