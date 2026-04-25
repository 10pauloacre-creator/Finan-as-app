import { NextRequest, NextResponse } from 'next/server';
import { createConnectToken } from '@/lib/pluggy-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { itemId?: string };
    const connectToken = await createConnectToken(body.itemId);
    return NextResponse.json({ connectToken });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[pluggy/connect-token]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
