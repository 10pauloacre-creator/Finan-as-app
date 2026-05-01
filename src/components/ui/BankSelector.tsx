'use client';

import BankLogo from '@/components/ui/BankLogo';
import { BANCO_INFO, BancoSlug } from '@/types';

interface BankSelectorProps {
  selected: BancoSlug;
  onChange: (banco: BancoSlug) => void;
  className?: string;
}

const BANCOS_LISTA = Object.entries(BANCO_INFO) as [BancoSlug, typeof BANCO_INFO[BancoSlug]][];

export default function BankSelector({ selected, onChange, className = '' }: BankSelectorProps) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${className}`}>
      {BANCOS_LISTA.map(([slug, info]) => {
        const ativo = selected === slug;
        return (
          <button
            key={slug}
            type="button"
            onClick={() => onChange(slug)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all ${
              ativo
                ? 'border-purple-500/40 bg-purple-600/15 text-white'
                : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
            }`}
          >
            <BankLogo banco={slug} size={28} className="h-7 w-7 rounded-lg border border-white/10 p-1" />
            <span className="text-xs font-medium leading-tight">{info.nome}</span>
          </button>
        );
      })}
    </div>
  );
}
