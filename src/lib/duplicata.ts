import type { Transacao } from '@/types';

export interface CandidatoDuplicata {
  valor: number;
  categoria_id: string;
  data: string;
}

/** Returns the existing transaction if a duplicate is found within 2 days, else null. */
export function detectarDuplicata(
  nova: CandidatoDuplicata,
  existentes: Transacao[],
): Transacao | null {
  const novaMs = new Date(nova.data).getTime();
  const DOIS_DIAS = 2 * 24 * 60 * 60 * 1000;
  return existentes.find(t => {
    if (t.valor !== nova.valor) return false;
    if (t.categoria_id !== nova.categoria_id) return false;
    const diff = Math.abs(new Date(t.data).getTime() - novaMs);
    return diff <= DOIS_DIAS;
  }) ?? null;
}
