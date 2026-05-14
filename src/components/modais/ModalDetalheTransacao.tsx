'use client';

import { Edit, X } from 'lucide-react';
import { formatarMoeda } from '@/lib/storage';
import { parseFinancialDate, startOfTodayLocal } from '@/lib/date';
import {
  calcularDataFinalParcelamento,
  calcularGastoRecorrenteAnual,
  calcularParcelamentoInfo,
  getDataCompetenciaDespesa,
} from '@/lib/transacoes';
import type { CartaoCredito, ContaBancaria, Transacao } from '@/types';

function getNomeConta(conta?: ContaBancaria) {
  if (!conta) return 'Sem conta vinculada';
  return `${conta.nome} • ${conta.tipo}`;
}

function getNomeCartao(cartao?: CartaoCredito) {
  if (!cartao) return 'Sem cartão vinculado';
  return `${cartao.nome} • ${cartao.bandeira}`;
}

export default function ModalDetalheTransacao({
  transacao,
  conta,
  cartao,
  categoriaNome,
  onEditar,
  onFechar,
}: {
  transacao: Transacao;
  conta?: ContaBancaria;
  cartao?: CartaoCredito;
  categoriaNome: string;
  onEditar: () => void;
  onFechar: () => void;
}) {
  const hoje = startOfTodayLocal();
  const parcelamento = calcularParcelamentoInfo(transacao, hoje);
  const gastoAnual = calcularGastoRecorrenteAnual(transacao);
  const ehReceita = transacao.tipo === 'receita';
  const dataCobranca = transacao.tipo === 'despesa' ? getDataCompetenciaDespesa(transacao, cartao) : null;
  const dataFinalParcelamento = transacao.parcelas && transacao.parcelas > 1
    ? calcularDataFinalParcelamento(transacao)
    : null;

  const classificacaoLabel = transacao.classificacao === 'fixa'
    ? 'Fixa / Recorrente'
    : transacao.classificacao === 'futura'
    ? 'Futura'
    : 'Padrão';

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl lg:rounded-2xl border border-slate-700 bg-slate-900">

        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900 p-5">
          <div>
            <h3 className="text-lg font-bold text-white">{transacao.descricao}</h3>
            <p className="text-xs text-slate-500 mt-1">Detalhes completos do lançamento</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEditar}
              className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-2 text-purple-300 hover:bg-purple-500/20 transition-colors"
              title="Editar lançamento"
            >
              <Edit size={14} />
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="rounded-lg p-1.5 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Corpo */}
        <div className="space-y-4 p-5">

          {/* Linha 1: valor, data, categoria, classificação */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={`rounded-2xl border p-3 ${ehReceita ? 'border-emerald-500/15 bg-emerald-500/5' : 'border-red-500/15 bg-red-500/5'}`}>
              <div className="text-[11px] text-slate-500">Valor</div>
              <div className={`mt-1 text-sm font-semibold tabular-nums ${ehReceita ? 'text-emerald-400' : 'text-red-400'}`}>
                {ehReceita ? '+' : '-'}{formatarMoeda(parcelamento?.valorTotal ?? transacao.valor)}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">{transacao.cartao_id ? 'Data da compra' : 'Data'}</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {parseFinancialDate(transacao.data).toLocaleDateString('pt-BR')}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Categoria</div>
              <div className="mt-1 text-sm font-semibold text-white truncate">{categoriaNome}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] text-slate-500">Classificação</div>
              <div className="mt-1 text-sm font-semibold text-white capitalize">{classificacaoLabel}</div>
            </div>
          </div>

          {/* Linha 2: pagamento + origem */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div>
                <div className="text-[11px] text-slate-500">Forma de pagamento</div>
                <div className="mt-1 text-sm font-semibold text-white uppercase">
                  {transacao.metodo_pagamento || 'Não informado'}
                </div>
              </div>
              {dataCobranca && (
                <div>
                  <div className="text-[11px] text-slate-500">Data de cobrança</div>
                  <div className="mt-1 text-sm text-amber-300">
                    {parseFinancialDate(dataCobranca).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] text-slate-500">Conta</div>
                <div className="mt-1 text-sm text-slate-200">{getNomeConta(conta)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Cartão</div>
                <div className="mt-1 text-sm text-slate-200">{getNomeCartao(cartao)}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div>
                <div className="text-[11px] text-slate-500">Origem</div>
                <div className="mt-1 text-sm font-semibold text-white">{transacao.origem}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Local</div>
                <div className="mt-1 text-sm text-slate-200">{transacao.local || 'Não informado'}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Horário</div>
                <div className="mt-1 text-sm text-slate-200">{transacao.horario || 'Não informado'}</div>
              </div>
            </div>
          </div>

          {/* Gasto anual estimado */}
          {gastoAnual !== null && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="text-[11px] text-slate-500">Gasto anual estimado</div>
              <div className="mt-1 text-base font-semibold text-blue-300 tabular-nums">
                {formatarMoeda(gastoAnual)}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Como esta despesa é fixa/recorrente, o app projeta {formatarMoeda(transacao.valor)} por mês ao longo de 12 meses.
              </p>
            </div>
          )}

          {/* Parcelamento */}
          {parcelamento && (
            <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <div className="text-[11px] text-slate-500">Parcelas</div>
                  <div className="mt-1 text-sm font-semibold text-white">{parcelamento.totalParcelas}x</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">{ehReceita ? 'Já recebido' : 'Já pago'}</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {parcelamento.parcelasLiquidadasAntes}/{parcelamento.totalParcelas}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">{ehReceita ? 'Faltam receber' : 'Faltam pagar'}</div>
                  <div className="mt-1 text-sm font-semibold text-amber-300">{parcelamento.parcelasRestantes}x</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Valor da parcela</div>
                  <div className="mt-1 text-sm font-semibold text-white tabular-nums">
                    {formatarMoeda(parcelamento.valorParcela)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">{ehReceita ? 'Valor a receber' : 'Valor restante'}</div>
                  <div className="mt-1 text-sm font-semibold text-white tabular-nums">
                    {formatarMoeda(parcelamento.valorRestante)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Termina em</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {parcelamento.dataFinal.toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Parcela atual em aberto: {Math.min(parcelamento.parcelasLiquidadasAntes + 1, parcelamento.totalParcelas)}/{parcelamento.totalParcelas}.
                Valor total planejado: {formatarMoeda(parcelamento.valorTotal)}.
                {dataFinalParcelamento ? ` Última previsão em ${dataFinalParcelamento.toLocaleDateString('pt-BR')}.` : ''}
              </p>
            </div>
          )}

          {/* Observações */}
          {transacao.observacoes && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] text-slate-500">Observações</div>
              <p className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">{transacao.observacoes}</p>
            </div>
          )}

          {/* Itens da compra */}
          {transacao.itens_compra && transacao.itens_compra.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[11px] text-slate-500 mb-3">Itens da compra</div>
              <div className="space-y-2">
                {transacao.itens_compra.map((item, index) => (
                  <div
                    key={`${item.nome}-${index}`}
                    className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2"
                  >
                    <div className="text-sm text-white">{item.nome}</div>
                    <div className="text-sm text-slate-300 tabular-nums">
                      {item.valor !== null ? formatarMoeda(item.valor) : 'Sem valor'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
