import { NextRequest, NextResponse } from 'next/server';
import { getItem, getAccounts, getAllTransactions, getInvestments, getLoans } from '@/lib/pluggy-server';

// ── Tipos do payload Pluggy Webhook ────────────────────────────────────────────

type PluggyWebhookEvent =
  | { event: 'item/created';   itemId: string; eventId: string }
  | { event: 'item/updated';   itemId: string; eventId: string }
  | { event: 'item/error';     itemId: string; eventId: string; error?: { code: string; message: string } }
  | { event: 'item/waiting_user_input'; itemId: string; eventId: string }
  | { event: 'item/login_succeeded';    itemId: string; eventId: string }
  | { event: string;           itemId?: string; eventId?: string };

// ── Handler principal ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Responde 200 imediatamente (Pluggy exige resposta 2xx em até 5 segundos)
  const body = await req.json().catch(() => ({})) as PluggyWebhookEvent;

  console.log('[webhook/pluggy] event:', body.event, '| itemId:', body.itemId ?? 'n/a');

  // Processa em background para não bloquear a resposta
  handleEvent(body).catch(err =>
    console.error('[webhook/pluggy] background error:', err),
  );

  return NextResponse.json({ received: true });
}

// ── Lógica por tipo de evento ──────────────────────────────────────────────────

async function handleEvent(payload: PluggyWebhookEvent) {
  switch (payload.event) {

    // Item conectado ou atualizado com sucesso → re-sincroniza dados
    case 'item/created':
    case 'item/updated':
    case 'item/login_succeeded': {
      if (!payload.itemId) break;
      await sincronizarItem(payload.itemId);
      break;
    }

    // Erro na conexão → apenas loga (frontend já trata via onError do widget)
    case 'item/error': {
      const ev = payload as Extract<PluggyWebhookEvent, { event: 'item/error' }>;
      console.warn(
        '[webhook/pluggy] item error:', ev.itemId,
        '|', ev.error?.code, '—', ev.error?.message,
      );
      break;
    }

    // Aguardando input do usuário (MFA, token físico, etc.)
    case 'item/waiting_user_input':
      console.log('[webhook/pluggy] waiting user input for item:', payload.itemId);
      break;

    default:
      console.log('[webhook/pluggy] unhandled event:', payload.event);
  }
}

// ── Sincronização automática via webhook ───────────────────────────────────────
// Chamada quando item/created ou item/updated chegam.
// Aqui você pode persistir no Supabase diretamente se quiser sync server-side.
// Por ora apenas valida que os dados chegam (frontend faz a persistência via /api/pluggy/sync).

async function sincronizarItem(itemId: string) {
  try {
    const [item, accounts, investments, loans] = await Promise.all([
      getItem(itemId),
      getAccounts(itemId),
      getInvestments(itemId),
      getLoans(itemId),
    ]);

    const txCount = (
      await Promise.all(accounts.map(acc => getAllTransactions(acc.id, 60)))
    ).reduce((sum, txs) => sum + txs.length, 0);

    console.log(
      `[webhook/pluggy] synced "${item.connector.name}" |`,
      `accounts: ${accounts.length} | tx: ${txCount} |`,
      `investments: ${investments.length} | loans: ${loans.length}`,
    );

    // TODO (produção): persistir direto no Supabase quando quiser sync automático
    // sem o usuário precisar clicar em "Sincronizar" no app.

  } catch (err) {
    console.error('[webhook/pluggy] sincronizarItem failed:', err);
  }
}
