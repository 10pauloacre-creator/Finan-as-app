import type { Transacao } from '@/types';
import { diffDaysBetween, formatFinancialDate, parseFinancialDate } from './date';

export interface AssinaturaDetectada {
  descricaoNormalizada: string;
  descricaoOriginal: string;    // most recent occurrence description
  valor: number;                // median value
  frequencia: 'mensal' | 'quinzenal' | 'semanal';
  ultimaCobranca: string;       // YYYY-MM-DD
  proximaEstimada: string;      // YYYY-MM-DD
  totalPago: number;
  ocorrencias: number;
  categoria_id: string;
}

function normalizar(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d+/g, '')        // remove numbers (dates, amounts in description)
    .replace(/[^\w\s]/g, '')    // remove special chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);              // cap length for grouping
}

function mediana(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function addDays(dateStr: string, days: number): string {
  const d = parseFinancialDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatFinancialDate(d);
}

export function detectarAssinaturas(transacoes: Transacao[]): AssinaturaDetectada[] {
  // Only consider despesas
  const despesas = transacoes.filter(t => t.tipo === 'despesa');

  // Group by normalized description
  const grupos = new Map<string, Transacao[]>();
  for (const t of despesas) {
    const chave = normalizar(t.descricao);
    if (!chave || chave.length < 3) continue;
    const grupo = grupos.get(chave) ?? [];
    grupo.push(t);
    grupos.set(chave, grupo);
  }

  const assinaturas: AssinaturaDetectada[] = [];

  for (const [chave, txs] of grupos) {
    if (txs.length < 2) continue;

    // Sort by date ascending
    const sorted = [...txs].sort((a, b) => a.data.localeCompare(b.data));

    // Calculate intervals between consecutive occurrences (in days)
    const intervalos: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = parseFinancialDate(sorted[i - 1].data);
      const b = parseFinancialDate(sorted[i].data);
      intervalos.push(diffDaysBetween(b, a));
    }

    // Detect frequency
    const mediaIntervalo = intervalos.reduce((s, v) => s + v, 0) / intervalos.length;
    let frequencia: AssinaturaDetectada['frequencia'] | null = null;
    if (mediaIntervalo >= 25 && mediaIntervalo <= 35) frequencia = 'mensal';
    else if (mediaIntervalo >= 12 && mediaIntervalo <= 18) frequencia = 'quinzenal';
    else if (mediaIntervalo >= 5 && mediaIntervalo <= 9) frequencia = 'semanal';

    if (!frequencia) continue;

    // Check value consistency — all within ±20% of median
    const valores = sorted.map(t => t.valor);
    const med = mediana(valores);
    const consistente = valores.every(v => Math.abs(v - med) / med <= 0.2);
    if (!consistente) continue;

    const ultima = sorted[sorted.length - 1];
    const diasFreq = frequencia === 'mensal' ? 30 : frequencia === 'quinzenal' ? 15 : 7;
    const proxima = addDays(ultima.data, diasFreq);

    assinaturas.push({
      descricaoNormalizada: chave,
      descricaoOriginal: ultima.descricao,
      valor: med,
      frequencia,
      ultimaCobranca: ultima.data,
      proximaEstimada: proxima,
      totalPago: valores.reduce((s, v) => s + v, 0),
      ocorrencias: sorted.length,
      categoria_id: ultima.categoria_id,
    });
  }

  // Sort by total paid descending (most expensive subscriptions first)
  return assinaturas.sort((a, b) => b.totalPago - a.totalPago);
}
