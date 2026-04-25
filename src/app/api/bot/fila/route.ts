import { NextRequest, NextResponse } from 'next/server';
import { lerFila, marcarImportadas } from '@/lib/data-store';

export async function GET() {
  const fila = await lerFila();
  const pendentes = fila.filter(t => !t.importado);
  return NextResponse.json({ transacoes: pendentes, total: pendentes.length });
}

export async function PATCH(req: NextRequest) {
  try {
    const { ids } = await req.json() as { ids: string[] };
    await marcarImportadas(ids);
    return NextResponse.json({ ok: true, marcadas: ids.length });
  } catch (err) {
    console.error('[bot/fila PATCH]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
