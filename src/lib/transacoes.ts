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

export function calcularDataFinalParcelamento(transacao: Pick<Transacao, 'data' | 'parcelas'>) {
  const totalParcelas = transacao.parcelas || 1;
  const dataBase = parseFinancialDate(transacao.data);
  return criarDataNoMes(
    dataBase.getFullYear(),
    dataBase.getMonth() + Math.max(totalParcelas - 1, 0),
    dataBase.getDate(),
  );
}

function contarParcelasOcorridasAteData(
  transacao: Pick<Transacao, 'data' | 'parcelas'>,
  referencia = startOfTodayLocal(),
) {
  const totalParcelas = transacao.parcelas || 1;
  const dataBase = parseFinancialDate(transacao.data);
  const dataReferencia = inicioDoDia(referencia);
  let ocorridas = 0;

  for (let indice = 0; indice < totalParcelas; indice += 1) {
    const ocorrencia = criarDataNoMes(
      dataBase.getFullYear(),
      dataBase.getMonth() + indice,
      dataBase.getDate(),
    );
    if (ocorrencia <= dataReferencia) ocorridas += 1;
  }

  return ocorridas;
}

export function calcularParcelamentoInfo(
  transacao: Pick<Transacao, 'data' | 'valor' | 'parcelas' | 'parcela_atual'>,
  referencia = startOfTodayLocal(),
) {
  const totalParcelas = transacao.parcelas || 1;
  if (totalParcelas <= 1) return null;

  const parcelaAtual = transacao.parcela_atual
    ? Math.min(transacao.parcela_atual, totalParcelas)
    : Math.min(contarParcelasOcorridasAteData(transacao, referencia), totalParcelas);
  const parcelasRestantes = Math.max(totalParcelas - parcelaAtual, 0);
  const valorParcela = transacao.valor / totalParcelas;
  const valorRestante = parcelasRestantes * valorParcela;

  return {
    parcelaAtual,
    totalParcelas,
    parcelasRestantes,
    valorParcela,
    valorRestante,
    dataFinal: calcularDataFinalParcelamento(transacao),
  };
}

export function calcularGastoRecorrenteAnual(transacao: Pick<Transacao, 'tipo' | 'classificacao' | 'valor'>) {
  if (transacao.tipo !== 'despesa' || transacao.classificacao !== 'fixa') return null;
  return transacao.valor * 12;
}
