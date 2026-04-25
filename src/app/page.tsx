'use client';

import { useState, useEffect } from 'react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import TelaLogin from '@/components/TelaLogin';
import AppPrincipal from '@/components/AppPrincipal';

export default function Home() {
  const { autenticado, carregarDados } = useFinanceiroStore();
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    carregarDados();
    setMontado(true);
  }, [carregarDados]);

  // Evita flash de conteúdo antes de hidratar
  if (!montado) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">💰</div>
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
