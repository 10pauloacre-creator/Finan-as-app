'use client';

import { useState, useEffect } from 'react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import TelaLogin from '@/components/TelaLogin';
import AppPrincipal from '@/components/AppPrincipal';

export default function AppCliente() {
  const { autenticado, carregarDados } = useFinanceiroStore();
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    carregarDados();
    const timeout = window.setTimeout(() => setMontado(true), 0);
    return () => window.clearTimeout(timeout);
  }, [carregarDados]);

  if (!montado) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img src="/icons/icon-96x96.png" alt="FinanceiroIA" className="w-16 h-16 mx-auto mb-4 rounded-2xl opacity-80" />
          <p className="text-slate-400 text-sm animate-pulse">Carregando FinanceiroIA...</p>
        </div>
      </div>
    );
  }

  if (!autenticado) {
    return <TelaLogin />;
  }

  return <AppPrincipal />;
}
