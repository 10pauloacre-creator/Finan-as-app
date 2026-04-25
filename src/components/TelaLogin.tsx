'use client';

import { useState } from 'react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';

export default function TelaLogin() {
  const { autenticar } = useFinanceiroStore();
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState(false);
  const [shake, setShake] = useState(false);

  function handleDigito(d: string) {
    if (pin.length >= 6) return;
    const novoPin = pin + d;
    setPin(novoPin);
    setErro(false);

    if (novoPin.length >= 4) {
      setTimeout(() => {
        const ok = autenticar(novoPin);
        if (!ok) {
          setErro(true);
          setShake(true);
          setTimeout(() => {
            setPin('');
            setShake(false);
          }, 600);
        }
      }, 200);
    }
  }

  function handleApagar() {
    setPin(p => p.slice(0, -1));
    setErro(false);
  }

  const digitos = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-purple-950/20 to-slate-950 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="text-center mb-10">
        <div className="text-6xl mb-3">💰</div>
        <h1 className="text-2xl font-bold text-white">FinanceiroIA</h1>
        <p className="text-slate-400 text-sm mt-1">Controle financeiro inteligente</p>
      </div>

      {/* PIN Input Visual */}
      <div className={`flex gap-4 mb-8 ${shake ? 'animate-bounce' : ''}`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
              i < pin.length
                ? erro
                  ? 'bg-red-500 border-red-500'
                  : 'bg-purple-500 border-purple-500'
                : 'border-slate-600 bg-transparent'
            }`}
          />
        ))}
      </div>

      {erro && (
        <p className="text-red-400 text-sm mb-4">PIN incorreto. Tente novamente.</p>
      )}

      <p className="text-slate-400 text-sm mb-6">
        {pin.length === 0 ? 'Digite seu PIN' : `${pin.length} dígito${pin.length > 1 ? 's' : ''} digitado${pin.length > 1 ? 's' : ''}`}
      </p>

      {/* Teclado numérico */}
      <div className="grid grid-cols-3 gap-4 w-72">
        {digitos.map((d, i) => {
          if (d === '') return <div key={i} />;
          return (
            <button
              key={i}
              onClick={() => d === '⌫' ? handleApagar() : handleDigito(d)}
              className={`
                h-16 rounded-2xl text-xl font-semibold
                transition-all duration-100 active:scale-95
                ${d === '⌫'
                  ? 'text-slate-400 hover:text-white hover:bg-slate-700'
                  : 'bg-slate-800 hover:bg-purple-700 text-white border border-slate-700 hover:border-purple-500'
                }
              `}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Dica */}
      <p className="text-slate-600 text-xs mt-8 text-center">
        PIN padrão: 1234<br />
        (Configure nas preferências após entrar)
      </p>
    </div>
  );
}
