import { NextResponse } from 'next/server';

// API do Banco Central do Brasil — Série 432 = meta da taxa Selic (% a.a.)
// Documentação: https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1
const BCB_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json';

let cacheSelicTaxa: number | null = null;
let cacheSelicDataRef: string | null = null;
let cacheSelicData: Date | null = null;
const CACHE_HORAS = 24; // Atualiza a cada 24h

export async function GET() {
  // Retorna do cache se ainda válido
  if (
    cacheSelicTaxa !== null &&
    cacheSelicData !== null &&
    Date.now() - cacheSelicData.getTime() < CACHE_HORAS * 60 * 60 * 1000
  ) {
    return NextResponse.json({ taxa: cacheSelicTaxa, data_referencia: cacheSelicDataRef, fonte: 'cache' });
  }

  try {
    const res = await fetch(BCB_URL, {
      next: { revalidate: 86400 }, // Cache de 24h no Next.js
    });

    if (!res.ok) throw new Error('API do Banco Central indisponível');

    const dados = await res.json();
    const taxaAnual = parseFloat(String(dados[0]?.valor ?? '').replace(',', '.'));
    if (!Number.isFinite(taxaAnual) || taxaAnual <= 0) throw new Error('Resposta inválida do Banco Central');

    cacheSelicTaxa = taxaAnual;
    cacheSelicDataRef = dados[0]?.data ?? null;
    cacheSelicData = new Date();

    return NextResponse.json({
      taxa: taxaAnual,
      data_referencia: cacheSelicDataRef,
      fonte: 'Banco Central do Brasil',
    });
  } catch (error) {
    console.error('Erro ao buscar Selic:', error);

    // Última taxa conhecida (mesmo vencida) é melhor do que inventar um número.
    if (cacheSelicTaxa !== null) {
      return NextResponse.json({
        taxa: cacheSelicTaxa,
        data_referencia: cacheSelicDataRef,
        fonte: 'cache',
        aviso: 'Banco Central indisponível. Mostrando a última taxa obtida.',
      });
    }

    // Sem dado confiável: não devolvemos taxa. O cliente mantém o valor que já tem.
    return NextResponse.json(
      { taxa: null, fonte: 'indisponivel', aviso: 'Taxa Selic indisponível no momento.' },
      { status: 503 }
    );
  }
}
