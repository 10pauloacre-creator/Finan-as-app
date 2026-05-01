import { NextRequest, NextResponse } from 'next/server';
import {
  getItem, getAccounts, getAllTransactions,
  getInvestments, getLoans,
} from '@/lib/pluggy-server';
import type { Account, Transaction, Investment, Loan } from 'pluggy-sdk';
import type { BancoSlug, BandeirCartao } from '@/types';

// ── Mapeamentos ───────────────────────────────────────────────────────────────

function mapBanco(name?: string): BancoSlug {
  const n = (name || '').toLowerCase();
  if (n.includes('nubank'))    return 'nubank';
  if (n.includes('itaú') || n.includes('itau')) return 'itau';
  if (n.includes('bradesco'))  return 'bradesco';
  if (n.includes('banco do brasil') || n === 'bb') return 'bb';
  if (n.includes('caixa'))     return 'caixa';
  if (n.includes('inter'))     return 'inter';
  if (n.includes('c6'))        return 'c6';
  if (n.includes('santander')) return 'santander';
  if (n.includes('mercado pago') || n.includes('mercadopago')) return 'mercadopago';
  return 'outro';
}

function mapBandeira(brand?: string): BandeirCartao {
  const b = (brand || '').toLowerCase();
  if (b.includes('visa'))      return 'visa';
  if (b.includes('master'))    return 'mastercard';
  if (b.includes('elo'))       return 'elo';
  if (b.includes('amex') || b.includes('american')) return 'amex';
  if (b.includes('hipercard')) return 'hipercard';
  return 'mastercard';
}

function mapCategoria(category?: string): string {
  const c = (category || '').toLowerCase();
  if (c.includes('food') || c.includes('alimenta') || c.includes('restaurante') || c.includes('mercado')) return 'alimentacao';
  if (c.includes('transport') || c.includes('uber') || c.includes('combustí')) return 'transporte';
  if (c.includes('saúde') || c.includes('saude') || c.includes('health') || c.includes('farmá')) return 'saude';
  if (c.includes('moradia') || c.includes('housing') || c.includes('aluguel')) return 'moradia';
  if (c.includes('educaç') || c.includes('education')) return 'educacao';
  if (c.includes('lazer') || c.includes('entertainment')) return 'lazer';
  if (c.includes('assinatura') || c.includes('subscription')) return 'assinaturas';
  if (c.includes('investimento') || c.includes('investment')) return 'investimentos';
  if (c.includes('salário') || c.includes('salary') || c.includes('income')) return 'salario';
  return 'outros';
}

// ── Tipos de resposta ─────────────────────────────────────────────────────────

export interface ContaSyncada {
  pluggy_account_id: string;
  pluggy_item_id: string;
  banco: BancoSlug;
  nome: string;
  tipo: string;
  saldo: number;
  pluggy_sync_em: string;
}

export interface CartaoSyncado {
  pluggy_account_id: string;
  pluggy_item_id: string;
  banco: BancoSlug;
  nome: string;
  bandeira: BandeirCartao;
  limite: number;
  fatura_atual: number;
  dia_vencimento: number;
  dia_fechamento: number;
  pluggy_sync_em: string;
}

export interface TransacaoSyncada {
  pluggy_id: string;
  pluggy_account_id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: 'despesa' | 'receita';
  categoria_id: string;
  metodo_pagamento: string;
}

export interface InvestimentoSyncado {
  pluggy_id: string;
  nome: string;
  tipo: string;
  valor_investido: number;
  valor_atual: number;
  taxa_rendimento?: number;
  data_inicio?: string;
  data_vencimento?: string;
}

export interface EmprestimoSyncado {
  pluggy_id: string;
  tipo: string;
  contratado: number;
  saldo_devedor: number;
  parcela_mensal?: number;
  total_parcelas?: number;
  parcelas_pagas?: number;
  proximo_vencimento?: string;
}

export interface SyncResult {
  itemId: string;
  bancaNome: string;
  contas: ContaSyncada[];
  cartoes: CartaoSyncado[];
  transacoes: TransacaoSyncada[];
  investimentos: InvestimentoSyncado[];
  emprestimos: EmprestimoSyncado[];
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { itemId } = await req.json() as { itemId: string };
    if (!itemId) return NextResponse.json({ error: 'itemId obrigatório' }, { status: 400 });

    // Busca tudo em paralelo
    const [item, accounts, investments, loans] = await Promise.all([
      getItem(itemId),
      getAccounts(itemId),
      getInvestments(itemId),
      getLoans(itemId),
    ]);

    const bancaNome = item.connector.name;
    const banco     = mapBanco(bancaNome);
    const agora     = new Date().toISOString();

    // Transações das contas em paralelo
    const txPorConta = await Promise.all(
      accounts.map(async (acc: Account) => ({
        accountId: acc.id,
        txs: await getAllTransactions(acc.id, 60),
      })),
    );

    // Contas bancárias (type === 'BANK')
    const contas: ContaSyncada[] = accounts
      .filter((a: Account) => a.type === 'BANK')
      .map((a: Account) => ({
        pluggy_account_id: a.id,
        pluggy_item_id: itemId,
        banco,
        nome: a.marketingName || a.name || bancaNome,
        tipo: a.subtype === 'SAVINGS_ACCOUNT' ? 'poupanca' : 'corrente',
        saldo: a.balance,
        pluggy_sync_em: agora,
      }));

    // Cartões (type === 'CREDIT')
    const cartoes: CartaoSyncado[] = accounts
      .filter((a: Account) => a.type === 'CREDIT')
      .map((a: Account) => {
        const cd = a.creditData;
        const dueDate   = cd?.balanceDueDate   ? new Date(cd.balanceDueDate).getDate()   : 15;
        const closeDate = cd?.balanceCloseDate ? new Date(cd.balanceCloseDate).getDate() : 8;
        return {
          pluggy_account_id: a.id,
          pluggy_item_id: itemId,
          banco,
          nome: a.marketingName || a.name || bancaNome,
          bandeira: mapBandeira(cd?.brand ?? undefined),
          limite: cd?.creditLimit || 0,
          fatura_atual: Math.abs(a.balance),
          dia_vencimento: dueDate,
          dia_fechamento: closeDate,
          pluggy_sync_em: agora,
        };
      });

    // Transações
    const transacoes: TransacaoSyncada[] = txPorConta.flatMap(({ accountId, txs }) =>
      (txs as Transaction[])
        .filter(tx => tx.status !== 'PENDING')
        .map(tx => ({
          pluggy_id: tx.id,
          pluggy_account_id: accountId,
          data: new Date(tx.date).toISOString().split('T')[0],
          descricao: tx.description,
          valor: Math.abs(tx.amount),
          tipo: tx.type === 'CREDIT' ? 'receita' : 'despesa',
          categoria_id: mapCategoria(tx.category ?? undefined),
          metodo_pagamento: tx.paymentData?.paymentMethod === 'PIX' ? 'pix' : 'debito',
        })),
    );

    // Investimentos
    const investimentos: InvestimentoSyncado[] = (investments as Investment[]).map(inv => ({
      pluggy_id: inv.id,
      nome: inv.name,
      tipo: inv.type,
      valor_investido: inv.amountOriginal ?? inv.amount ?? 0,
      valor_atual: inv.balance ?? 0,
      taxa_rendimento: inv.annualRate ?? inv.fixedAnnualRate ?? undefined,
      data_inicio: inv.purchaseDate
        ? new Date(inv.purchaseDate).toISOString().split('T')[0]
        : inv.date
          ? new Date(inv.date).toISOString().split('T')[0]
          : undefined,
      data_vencimento: inv.dueDate
        ? new Date(inv.dueDate).toISOString().split('T')[0]
        : undefined,
    }));

    // Empréstimos (campos reais do SDK Pluggy)
    const emprestimos: EmprestimoSyncado[] = (loans as Loan[]).map(loan => ({
      pluggy_id: loan.id,
      tipo: loan.type ?? 'Empréstimo',
      contratado: loan.contractAmount ?? 0,
      saldo_devedor: loan.payments?.contractOutstandingBalance ?? 0,
      total_parcelas: loan.installments?.totalNumberOfInstallments ?? undefined,
      parcelas_pagas: loan.installments?.paidInstallments ?? undefined,
      proximo_vencimento: loan.dueDate
        ? new Date(loan.dueDate).toISOString().split('T')[0]
        : undefined,
    }));

    const result: SyncResult = {
      itemId, bancaNome, contas, cartoes, transacoes, investimentos, emprestimos,
    };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[pluggy/sync]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
