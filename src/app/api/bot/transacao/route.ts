import { NextRequest, NextResponse } from 'next/server';
import { adicionarNaFila } from '@/lib/data-store';

const BOT_SECRET = process.env.BOT_SECRET || 'bot-secret-local';

export async function POST(req: NextRequest) {
  if (req.headers.get('x-bot-secret') !== BOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const transacao = await adicionarNaFila(body);
    return NextResponse.json({ ok: true, transacao });
  } catch (err) {
    console.error('[bot/transacao]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
