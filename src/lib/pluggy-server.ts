// Pluggy Open Finance — cliente server-side usando pluggy-sdk oficial
// Docs: https://docs.pluggy.ai
import { PluggyClient } from 'pluggy-sdk';
import type { Account, Transaction, Investment, Loan, Item } from 'pluggy-sdk';

// Re-exporta os tipos do SDK para usar nas rotas
export type { Account, Transaction, Investment, Loan, Item };

function getClient(): PluggyClient {
  const clientId     = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não configurados no .env.local');
  }
  return new PluggyClient({ clientId, clientSecret });
}

// ── Connect Token (para o widget frontend) ────────────────────────────────────

export async function createConnectToken(itemId?: string): Promise<string> {
  const client = getClient();
  const result = await client.createConnectToken(itemId);
  return result.accessToken;
}

// ── Item ──────────────────────────────────────────────────────────────────────

export async function getItem(itemId: string): Promise<Item> {
  return getClient().fetchItem(itemId);
}

export async function deleteItem(itemId: string): Promise<void> {
  return getClient().deleteItem(itemId);
}

// ── Contas ────────────────────────────────────────────────────────────────────

export async function getAccounts(itemId: string): Promise<Account[]> {
  const res = await getClient().fetchAccounts(itemId);
  return res.results;
}

// ── Transações (últimos N dias) ───────────────────────────────────────────────

export async function getAllTransactions(
  accountId: string,
  diasAtras = 60,
): Promise<Transaction[]> {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - diasAtras);
  return getClient().fetchAllTransactions(accountId, {
    dateFrom: dateFrom.toISOString().split('T')[0],
  });
}

// ── Investimentos ─────────────────────────────────────────────────────────────

export async function getInvestments(itemId: string): Promise<Investment[]> {
  try {
    const res = await getClient().fetchInvestments(itemId);
    return res.results;
  } catch {
    return []; // nem todo banco tem investimentos
  }
}

// ── Empréstimos ───────────────────────────────────────────────────────────────

export async function getLoans(itemId: string): Promise<Loan[]> {
  try {
    const res = await getClient().fetchLoans(itemId);
    return res.results;
  } catch {
    return []; // nem todo banco tem empréstimos
  }
}
