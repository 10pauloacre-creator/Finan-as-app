import { NextRequest, NextResponse } from 'next/server';
import { adicionarNaFila } from '@/lib/data-store';

const BOT_SECRET = process.env.BOT_SECRET || 'bot-secret-local';

export async function POST(req: NextRequest) {
  if (req.headers.get('x-bot-secret') !== BOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { transacoes } = await req.json() as { transacoes: Parameters<typeof adicionarNaFila>[0][] };
    const salvas = await Promise.all(transacoes.map(t => adicionarNaFila(t)));
    return NextResponse.json({ ok: true, total: salvas.length });
  } catch (err) {
    console.error('[bot/lote]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
