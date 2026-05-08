import type { CartaoCredito, Transacao } from '@/types';
import { formatFinancialDate, parseFinancialDate } from './date';
import { getDataCobrancaCartao } from './transacoes';

export type PeriodoReferenciaCartao = 'mes_atual' | 'mes_passado' | 'proximo_mes';

type MemoriaImportacaoCartao = {
  periodo: PeriodoReferenciaCartao;
  updatedAt: number;
};

const STORAGE_PREFIX = 'fin_cartao_importacao_memoria_v1:';
const TTL_24H = 24 * 60 * 60 * 1000;

function clampDia(ano: number, mesIndex: number, dia: number) {
  const ultimoDia = new Date(ano, mesIndex + 1, 0).getDate();
  return Math.min(Math.max(dia, 1), ultimoDia);
}

export function getDescricaoPeriodoReferencia(periodo: PeriodoReferenciaCartao) {
  if (periodo === 'mes_passado') return 'mes passado';
  if (periodo === 'proximo_mes') return 'proximo mes';
  return 'mes atual';
}

export function lerMemoriaImportacaoCartao(chave: string) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${chave}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MemoriaImportacaoCartao;
    if (!parsed?.periodo || !parsed?.updatedAt) return null;
    if (Date.now() - parsed.updatedAt > TTL_24H) {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${chave}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function salvarMemoriaImportacaoCartao(chave: string, periodo: PeriodoReferenciaCartao) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(
    `${STORAGE_PREFIX}${chave}`,
    JSON.stringify({
      periodo,
      updatedAt: Date.now(),
    } satisfies MemoriaImportacaoCartao),
  );
}

export function solicitarPeriodoReferenciaCartao(cartao: CartaoCredito, nomeArquivo: string) {
  if (typeof window === 'undefined') return null;

  const chaveMemoria = `${cartao.id}:contexto`;
  const memoria = lerMemoriaImportacaoCartao(chaveMemoria);
  const sugestao = memoria ? getDescricaoPeriodoReferencia(memoria.periodo) : 'mes atual';

  const resposta = window.prompt(
    [
      `O arquivo "${nomeArquivo}" do cartao ${cartao.nome} se refere a qual fatura?`,
      '1 - Mes atual: atualizar apenas novos gastos da fatura atual',
      '2 - Mes passado: fatura ja paga',
      '3 - Proximo mes: gastos apos o fechamento do mes atual',
      `Sugestao lembrada nas ultimas 24h: ${sugestao}`,
      'Digite 1, 2 ou 3.',
    ].join('\n'),
    memoria?.periodo === 'mes_passado' ? '2' : memoria?.periodo === 'proximo_mes' ? '3' : '1',
  );

  if (!resposta) return null;

  const normalizada = resposta.trim().toLowerCase();
  const periodo: PeriodoReferenciaCartao | null =
    normalizada === '2' ? 'mes_passado'
      : normalizada === '3' ? 'proximo_mes'
      : normalizada === '1' ? 'mes_atual'
      : null;

  if (!periodo) {
    window.alert('Importacao cancelada: informe 1 para mes atual, 2 para mes passado ou 3 para proximo mes.');
    return null;
  }

  salvarMemoriaImportacaoCartao(chaveMemoria, periodo);
  return periodo;
}

export function getDataCobrancaPorReferencia(cartao: CartaoCredito, periodo: PeriodoReferenciaCartao, base = new Date()) {
  const deslocamentoMes = periodo === 'mes_passado' ? -1 : periodo === 'proximo_mes' ? 1 : 0;
  const ano = base.getFullYear();
  const mesIndex = base.getMonth() + deslocamentoMes;
  const dia = clampDia(ano, mesIndex, cartao.dia_vencimento);
  return formatFinancialDate(new Date(ano, mesIndex, dia));
}

export function getChaveFaturaMes(dataCobranca: string) {
  const data = parseFinancialDate(dataCobranca);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

export function existeValorNaFaturaDoMes(
  transacoes: Transacao[],
  cartao: CartaoCredito,
  valor: number,
  dataCobrancaReferencia: string,
) {
  const chaveMes = getChaveFaturaMes(dataCobrancaReferencia);

  return transacoes.some((transacao) => {
    if (transacao.cartao_id !== cartao.id) return false;
    if (transacao.tipo !== 'despesa') return false;
    if (Math.abs(transacao.valor - valor) >= 0.01) return false;

    const dataCobrancaExistente = transacao.data_cobranca || getDataCobrancaCartao(transacao, cartao);
    return getChaveFaturaMes(dataCobrancaExistente) === chaveMes;
  });
}
