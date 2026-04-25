// Consulta e marca eventos de webhook como lidos
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// GET — retorna eventos não sincronizados
export async function GET() {
  try {
    const db = getSupabaseServer();
    const { data, error } = await db
      .from('webhook_events')
      .select('*')
      .eq('synced', false)
      .order('criado_em', { ascending: false })
      .limit(20);

    if (error) throw error;
    return NextResponse.json({ events: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — marca eventos de um item como sincronizados
export async function PATCH(req: NextRequest) {
  try {
    const { itemId } = await req.json() as { itemId: string };
    const db = getSupabaseServer();

    await db
      .from('webhook_events')
      .update({ synced: true })
      .eq('item_id', itemId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
