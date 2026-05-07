import type { Transacao } from '@/types';
import { parseFinancialDate, startOfTodayLocal } from './date';

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0, 0);
}

export function criarDataNoMes(ano: number, mesIndex: number, diaBase: number) {
  const ultimoDia = new Date(ano, mesIndex + 1, 0).getDate();
  return new Date(ano, mesIndex, Math.min(diaBase, ultimoDia), 0, 0, 0, 0);
}

export function transacaoJaOcorreuAteData(
  transacao: Pick<Transacao, 'data' | 'classificacao'>,
  referencia = startOfTodayLocal(),
) {
  const dataReferencia = inicioDoDia(referencia);
  const dataBase = parseFinancialDate(transacao.data);

  if (transacao.classificacao !== 'fixa') {
    return dataBase <= dataReferencia;
  }

  if (dataBase > dataReferencia) return false;

  const ocorrenciaMesAtual = criarDataNoMes(
    dataReferencia.getFullYear(),
    dataReferencia.getMonth(),
    dataBase.getDate(),
  );

  return ocorrenciaMesAtual <= dataReferencia;
}

export function transacaoContaNoMesAteData(
  transacao: Pick<Transacao, 'data' | 'classificacao'>,
  mes: number,
  ano: number,
  referencia = startOfTodayLocal(),
) {
  const dataReferencia = inicioDoDia(referencia);
  const mesIndex = mes - 1;

  if (transacao.classificacao === 'fixa') {
    const dataBase = parseFinancialDate(transacao.data);
    const ocorrencia = criarDataNoMes(ano, mesIndex, dataBase.getDate());

    if (ocorrencia < dataBase) return false;
    return ocorrencia <= dataReferencia;
  }

  const data = parseFinancialDate(transacao.data);
  return data.getFullYear() === ano && data.getMonth() === mesIndex && data <= dataReferencia;
}
