import { NextRequest, NextResponse } from 'next/server';
import { deleteItem } from '@/lib/pluggy-server';

export async function DELETE(req: NextRequest) {
  try {
    const { itemId } = await req.json() as { itemId: string };
    if (!itemId) return NextResponse.json({ error: 'itemId obrigatório' }, { status: 400 });
    await deleteItem(itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
