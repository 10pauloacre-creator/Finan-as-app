'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';

const POPULARES = ['USD', 'EUR', 'GBP', 'ARS', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'BTC'];

function nomeMoeda(codigo: string): string {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'currency' }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

function brl(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function CalculadoraMoedas() {
  const [taxas, setTaxas] = useState<Record<string, number>>({});
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [moeda, setMoeda] = useState('USD');
  const [valor, setValor] = useState('1');
  const [paraReal, setParaReal] = useState(true);

  async function carregar() {
    setCarregando(true);
    try {
      const res = await fetch('/api/moedas');
      const data = await res.json();
      if (!res.ok || !data?.taxas) throw new Error();
      setTaxas(data.taxas);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const codigos = useMemo(() => {
    const todos = Object.keys(taxas).filter(c => c !== 'BRL').sort();
    const populares = POPULARES.filter(c => taxas[c]);
    return [...populares, ...todos.filter(c => !populares.includes(c))];
  }, [taxas]);

  const taxa = taxas[moeda] ?? 0;
  const numero = parseFloat(valor.replace(',', '.'));
  const entrada = Number.isFinite(numero) ? numero : 0;
  const resultado = paraReal ? entrada * taxa : taxa > 0 ? entrada / taxa : 0;

  return (
    <div className="glass-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Calculadora de moedas</h3>
        <button onClick={carregar} disabled={carregando} aria-label="Atualizar cotações"
          className="text-slate-400 hover:text-white disabled:opacity-50">
          <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />
        </button>
      </div>

      {erro && <p className="text-xs text-amber-400">Não foi possível obter as cotações agora. Tente atualizar.</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <label className="space-y-1">
          <span className="text-xs text-slate-400">{paraReal ? 'Valor na moeda' : 'Valor em reais'}</span>
          <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white tabular-nums" />
        </label>
        <button onClick={() => setParaReal(v => !v)} aria-label="Inverter conversão"
          className="mx-auto rounded-xl border border-white/10 p-2.5 text-slate-300 hover:text-white">
          <ArrowLeftRight size={16} />
        </button>
        <label className="space-y-1">
          <span className="text-xs text-slate-400">Moeda</span>
          <select value={moeda} onChange={e => setMoeda(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#0d1220] px-3 py-2.5 text-sm text-white">
            {codigos.map(c => <option key={c} value={c}>{c} · {nomeMoeda(c)}</option>)}
            {codigos.length === 0 && <option value="USD">USD</option>}
          </select>
        </label>
      </div>

      <div className="rounded-xl bg-white/[0.04] p-4">
        <p className="text-xs text-slate-400">Resultado</p>
        <p className="text-2xl font-semibold tabular-nums text-white">
          {taxa > 0
            ? paraReal
              ? brl(resultado)
              : `${resultado.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${moeda}`
            : '—'}
        </p>
        {taxa > 0 && (
          <p className="mt-1 text-xs text-slate-400">1 {moeda} = {brl(taxa)}</p>
        )}
      </div>
    </div>
  );
}
