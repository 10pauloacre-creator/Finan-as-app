'use client';

import { useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

export default function DicaAjuda({ children, rotulo = 'Como ler estes números' }: { children: ReactNode; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={rotulo}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        onBlur={() => setAberto(false)}
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-white"
      >
        <HelpCircle size={16} />
      </button>
      {aberto && (
        <span role="tooltip" className="absolute right-0 top-7 z-30 w-72 max-w-[80vw] rounded-lg border border-white/10 bg-slate-900 p-3 text-left text-xs leading-relaxed text-slate-300 shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
}
