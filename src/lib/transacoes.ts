import type { Transacao } from '@/types';
import { parseFinancialDate, startOfTodayLocal } from './date';

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0, 0);
}

function diferencaMeses(inicio: Date, fim: Date) {
  return (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
}

function compararMesAno(a: Date, b: Date) {
  const ano = a.getFullYear() - b.getFullYear();
  if (ano !== 0) return ano;
  return a.getMonth() - b.getMonth();
}

export function criarDataNoMes(ano: number, mesIndex: number, diaBase: number) {
  const ultimoDia = new Date(ano, mesIndex + 1, 0).getDate();
  return new Date(ano, mesIndex, Math.min(diaBase, ultimoDia), 0, 0, 0, 0);
}

function getTotalParcelas(transacao: Pick<Transacao, 'parcelas'>) {
  return Math.max(transacao.parcelas || 1, 1);
}

function getParcelasJaLiquidadas(transacao: Pick<Transacao, 'parcela_atual' | 'parcelas'>) {
  return Math.max(Math.min(transacao.parcela_atual || 0, getTotalParcelas(transacao)), 0);
}

function getParcelasRestantesPlanejadas(transacao: Pick<Transacao, 'parcelas' | 'parcela_atual'>) {
  return Math.max(getTotalParcelas(transacao) - getParcelasJaLiquidadas(transacao), 0);
}

export function getValorTotalPlanejado(transacao: Pick<Transacao, 'valor' | 'parcelas'>) {
  return transacao.valor * getTotalParcelas(transacao);
}

export function getDataOcorrenciaNoMes(
  transacao: Pick<Transacao, 'data' | 'classificacao' | 'parcelas' | 'parcela_atual'>,
  mes: number,
  ano: number,
) {
  const mesIndex = mes - 1;
  const dataBase = parseFinancialDate(transacao.data);
  const ocorrencia = criarDataNoMes(ano, mesIndex, dataBase.getDate());

  if (ocorrencia < dataBase) return null;

  const deslocamento = diferencaMeses(dataBase, ocorrencia);
  if (deslocamento < 0) return null;

  const totalParcelas = getTotalParcelas(transacao);
  const parcelasRestantes = getParcelasRestantesPlanejadas(transacao);
  const parcelada = totalParcelas > 1;

  if (transacao.classificacao === 'fixa') {
    if (parcelada && deslocamento >= parcelasRestantes) return null;
    return ocorrencia;
  }

  if (parcelada) {
    return deslocamento < parcelasRestantes ? ocorrencia : null;
  }

  return dataBase.getFullYear() === ano && dataBase.getMonth() === mesIndex ? ocorrencia : null;
}

export function contarOcorrenciasAteData(
  transacao: Pick<Transacao, 'data' | 'classificacao' | 'parcelas' | 'parcela_atual'>,
  referencia = startOfTodayLocal(),
) {
  const dataReferencia = inicioDoDia(referencia);
  const dataBase = parseFinancialDate(transacao.data);
  if (dataBase > dataReferencia) return 0;

  const totalParcelas = getTotalParcelas(transacao);
  const parcelasRestantes = getParcelasRestantesPlanejadas(transacao);
  const parcelada = totalParcelas > 1;

  if (transacao.classificacao !== 'fixa' && !parcelada) {
    return 1;
  }

  let ocorrencias = 0;
  let deslocamento = 0;

  while (true) {
    if (transacao.classificacao !== 'fixa' && deslocamento > 0 && !parcelada) break;
    if (parcelada && deslocamento >= parcelasRestantes) break;

    const ocorrencia = criarDataNoMes(
      dataBase.getFullYear(),
      dataBase.getMonth() + deslocamento,
      dataBase.getDate(),
    );

    if (ocorrencia > dataReferencia) break;
    if (ocorrencia >= dataBase) ocorrencias += 1;

    deslocamento += 1;
    if (transacao.classificacao !== 'fixa' && !parcelada) break;
  }

  return ocorrencias;
}

export function transacaoJaOcorreuAteData(
  transacao: Pick<Transacao, 'data' | 'classificacao' | 'parcelas' | 'parcela_atual'>,
  referencia = startOfTodayLocal(),
) {
  const dataReferencia = inicioDoDia(referencia);
  const dataBase = parseFinancialDate(transacao.data);

  if (getTotalParcelas(transacao) > 1 && transacao.classificacao !== 'fixa') {
    return dataBase <= dataReferencia;
  }

  if (transacao.classificacao !== 'fixa') {
    return dataBase <= dataReferencia;
  }

  const ocorrenciaMesAtual = getDataOcorrenciaNoMes(
    transacao,
    dataReferencia.getMonth() + 1,
    dataReferencia.getFullYear(),
  );

  return Boolean(ocorrenciaMesAtual && ocorrenciaMesAtual <= dataReferencia);
}

export function transacaoContaNoMesAteData(
  transacao: Pick<Transacao, 'data' | 'classificacao' | 'parcelas' | 'parcela_atual'>,
  mes: number,
  ano: number,
  referencia = startOfTodayLocal(),
) {
  const dataReferencia = inicioDoDia(referencia);
  const ocorrencia = getDataOcorrenciaNoMes(transacao, mes, ano);
  if (!ocorrencia) return false;

  const comparacaoMes = compararMesAno(ocorrencia, dataReferencia);
  if (comparacaoMes < 0) return true;
  if (comparacaoMes > 0) return true;
  return ocorrencia <= dataReferencia;
}

export function calcularDataFinalParcelamento(transacao: Pick<Transacao, 'data' | 'parcelas' | 'parcela_atual'>) {
  const totalParcelasRestantes = Math.max(getParcelasRestantesPlanejadas(transacao), 1);
  const dataBase = parseFinancialDate(transacao.data);
  return criarDataNoMes(
    dataBase.getFullYear(),
    dataBase.getMonth() + Math.max(totalParcelasRestantes - 1, 0),
    dataBase.getDate(),
  );
}

export function calcularParcelamentoInfo(
  transacao: Pick<Transacao, 'data' | 'valor' | 'parcelas' | 'parcela_atual' | 'classificacao'>,
  referencia = startOfTodayLocal(),
) {
  const totalParcelas = getTotalParcelas(transacao);
  if (totalParcelas <= 1) return null;

  const parcelasLiquidadasAntes = getParcelasJaLiquidadas(transacao);
  const ocorrenciasDesdeInicio = Math.min(contarOcorrenciasAteData(transacao, referencia), getParcelasRestantesPlanejadas(transacao));
  const parcelasLiquidadasAgora = Math.min(parcelasLiquidadasAntes + ocorrenciasDesdeInicio, totalParcelas);
  const parcelasRestantes = Math.max(totalParcelas - parcelasLiquidadasAgora, 0);
  const valorParcela = transacao.valor;
  const valorTotal = valorParcela * totalParcelas;
  const valorRestante = parcelasRestantes * valorParcela;

  return {
    parcelaAtual: parcelasLiquidadasAgora,
    parcelasLiquidadasAntes,
    totalParcelas,
    parcelasRestantes,
    valorParcela,
    valorTotal,
    valorRestante,
    dataFinal: calcularDataFinalParcelamento(transacao),
  };
}

export function calcularGastoRecorrenteAnual(transacao: Pick<Transacao, 'tipo' | 'classificacao' | 'valor' | 'parcelas'>) {
  if (transacao.tipo !== 'despesa' || transacao.classificacao !== 'fixa' || getTotalParcelas(transacao) > 1) return null;
  return transacao.valor * 12;
}
