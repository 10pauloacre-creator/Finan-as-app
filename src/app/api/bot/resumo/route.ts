import { NextResponse } from 'next/server';
import { lerFila } from '@/lib/data-store';

export async function GET() {
  const fila = await lerFila();
  const agora = new Date();
  const mes = agora.getMonth() + 1;
  const ano = agora.getFullYear();

  const doMes = fila.filter(t => {
    const d = new Date(t.data);
    return d.getMonth() + 1 === mes && d.getFullYear() === ano;
  });

  const totalGasto   = doMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
  const totalReceita = doMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);

  const porCategoria: Record<string, number> = {};
  doMes.filter(t => t.tipo === 'despesa').forEach(t => {
    porCategoria[t.categoria] = (porCategoria[t.categoria] || 0) + t.valor;
  });

  const categorias = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, valor]) => ({ nome, valor }));

  return NextResponse.json({
    mes, ano, totalGasto, totalReceita,
    saldo: totalReceita - totalGasto,
    categorias,
    totalTransacoes: doMes.length,
  });
}
