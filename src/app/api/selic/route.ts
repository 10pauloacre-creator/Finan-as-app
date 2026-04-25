import { NextResponse } from 'next/server';

// API do Banco Central do Brasil — Série 432 = Taxa Selic
// Documentação: https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1
const BCB_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json';

let cacheSelicTaxa: number | null = null;
let cacheSelicData: Date | null = null;
const CACHE_HORAS = 24; // Atualiza a cada 24h

export async function GET() {
  try {
    // Retorna do cache se ainda válido
    if (
      cacheSelicTaxa !== null &&
      cacheSelicData !== null &&
      Date.now() - cacheSelicData.getTime() < CACHE_HORAS * 60 * 60 * 1000
    ) {
      return NextResponse.json({ taxa: cacheSelicTaxa, fonte: 'cache' });
    }

    const res = await fetch(BCB_URL, {
      next: { revalidate: 86400 }, // Cache de 24h no Next.js
    });

    if (!res.ok) throw new Error('API do Banco Central indisponível');

    const dados = await res.json();
    // A série retorna valor diário — convertemos para anual (aproximação: * 252 dias úteis)
    // Na verdade a série 432 já retorna a meta da Selic, que é anual
    const taxaAnual = parseFloat(dados[0]?.valor || '10.5');

    // Atualiza cache
    cacheSelicTaxa = taxaAnual;
    cacheSelicData = new Date();

    return NextResponse.json({
      taxa: taxaAnual,
      data_referencia: dados[0]?.data,
      fonte: 'Banco Central do Brasil',
    });
  } catch (error) {
    console.error('Erro ao buscar Selic:', error);
    // Fallback com taxa aproximada caso a API esteja fora
    return NextResponse.json({
      taxa: 10.5,
      fonte: 'fallback',
      aviso: 'Usando taxa estimada. API do Banco Central indisponível.'
    });
  }
}
