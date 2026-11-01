export function parseFinancialDate(date: string): Date {
  const [ano, mes, dia] = date.split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 0, 0, 0, 0);
}

export function formatFinancialDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function isSameFinancialMonth(date: string, mes: number, ano: number): boolean {
  const parsed = parseFinancialDate(date);
  return parsed.getMonth() + 1 === mes && parsed.getFullYear() === ano;
}

export function startOfTodayLocal(): Date {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
}

export function diffDaysBetween(dateA: Date, dateB: Date): number {
  return Math.round((dateA.getTime() - dateB.getTime()) / 86400000);
}

/** Dias corridos até a próxima ocorrência do dia de vencimento (0 = hoje). */
export function diasAteVencimento(diaVencimento: number, base: Date = startOfTodayLocal()): number {
  const ultimoDiaMes = (ano: number, mes: number) => new Date(ano, mes + 1, 0).getDate();
  let alvo = new Date(base.getFullYear(), base.getMonth(), Math.min(diaVencimento, ultimoDiaMes(base.getFullYear(), base.getMonth())));
  if (alvo.getTime() < base.getTime()) {
    const proximoMes = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    alvo = new Date(proximoMes.getFullYear(), proximoMes.getMonth(), Math.min(diaVencimento, ultimoDiaMes(proximoMes.getFullYear(), proximoMes.getMonth())));
  }
  return diffDaysBetween(alvo, base);
}
