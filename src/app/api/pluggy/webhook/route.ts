// Gerencia webhooks Pluggy: registrar, listar e deletar
import { NextRequest, NextResponse } from 'next/server';
import { PluggyClient } from 'pluggy-sdk';

function getClient() {
  return new PluggyClient({
    clientId:     process.env.PLUGGY_CLIENT_ID!,
    clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
  });
}

// URL pública do nosso receptor de webhooks
function getWebhookUrl(req: NextRequest): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || `https://${req.headers.get('host')}`;
  return `${appUrl}/api/webhooks/pluggy`;
}

// ── GET — lista webhooks registrados ──────────────────────────────────────────

export async function GET() {
  try {
    const client = getClient();
    const { results } = await client.fetchWebhooks();
    return NextResponse.json({ webhooks: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST — registra webhook ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const client = getClient();
    const url = getWebhookUrl(req);

    // Verifica se já existe para evitar duplicatas
    const { results } = await client.fetchWebhooks();
    const existente = results.find((w) => w.url === url);
    if (existente) {
      return NextResponse.json({ webhook: existente, criado: false });
    }

    // createWebhook(event, url) — evento primeiro, depois URL
    const webhook = await client.createWebhook('item/updated', url);

    // Cria também para item/created e item/error
    await Promise.allSettled([
      client.createWebhook('item/created', url),
      client.createWebhook('item/error' as Parameters<typeof client.createWebhook>[0], url),
    ]);

    return NextResponse.json({ webhook, criado: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[pluggy/webhook POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE — remove todos os webhooks da nossa URL ────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const client = getClient();
    const url = getWebhookUrl(req);

    const { results } = await client.fetchWebhooks();
    const nossos = results.filter((w) => w.url === url);

    await Promise.all(nossos.map((w) => client.deleteWebhook(w.id)));

    return NextResponse.json({ deletados: nossos.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
