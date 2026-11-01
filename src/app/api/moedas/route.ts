import { NextResponse } from 'next/server';

// Cotações em relação ao real (open.er-api.com, sem chave). Valor retornado: quantos reais vale 1 unidade da moeda.
const URL_COTACOES = 'https://open.er-api.com/v6/latest/BRL';
const CACHE_MS = 60 * 60 * 1000;

let cache: { taxas: Record<string, number>; atualizado: string; em: number } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.em < CACHE_MS) {
    return NextResponse.json({ taxas: cache.taxas, atualizado: cache.atualizado });
  }
  try {
    const res = await fetch(URL_COTACOES, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error('Serviço de cotações indisponível');
    const dados = await res.json();
    const brutas = dados?.rates as Record<string, number> | undefined;
    if (!brutas || dados.result !== 'success') throw new Error('Resposta inválida');

    const taxas: Record<string, number> = { BRL: 1 };
    for (const [moeda, porReal] of Object.entries(brutas)) {
      if (Number.isFinite(porReal) && porReal > 0) taxas[moeda] = 1 / porReal;
    }
    cache = { taxas, atualizado: String(dados.time_last_update_utc ?? ''), em: Date.now() };
    return NextResponse.json({ taxas, atualizado: cache.atualizado });
  } catch (error) {
    console.error('Erro ao buscar cotações:', error);
    if (cache) return NextResponse.json({ taxas: cache.taxas, atualizado: cache.atualizado, fonte: 'cache' });
    return NextResponse.json({ error: 'Não foi possível obter as cotações agora.' }, { status: 502 });
  }
}
