import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

type Snapshot = {
  transacoes?: Record<string, unknown>[];
  categorias?: Record<string, unknown>[];
  contas?: Record<string, unknown>[];
  cartoes?: Record<string, unknown>[];
  investimentos?: Record<string, unknown>[];
  metas?: Record<string, unknown>[];
  orcamentos?: Record<string, unknown>[];
  reservas?: Record<string, unknown>[];
  config?: Record<string, unknown> | null;
};

function agoraIso() {
  return new Date().toISOString();
}

function comDatas<T extends Record<string, unknown>>(registro: T) {
  return {
    ...registro,
    criado_em: typeof registro.criado_em === 'string' ? registro.criado_em : agoraIso(),
    atualizado_em: typeof registro.atualizado_em === 'string' ? registro.atualizado_em : agoraIso(),
  };
}

async function upsertLista(
  tabela: string,
  registros: Record<string, unknown>[] | undefined,
) {
  if (!registros?.length) return 0;
  const supabase = getSupabaseServer();
  const dados = registros.map((registro) => comDatas(registro));
  const resultado = await supabase.from(tabela).upsert(dados);
  if (resultado.error) throw resultado.error;
  return dados.length;
}

async function upsertConfig(config: Record<string, unknown> | null | undefined) {
  if (!config) return 0;
  const supabase = getSupabaseServer();
  const payload = {
    id: 'default',
    ...config,
    atualizado_em: typeof config.atualizado_em === 'string' ? config.atualizado_em : agoraIso(),
  };
  const resultado = await supabase.from('configuracoes_app').upsert(payload);
  if (resultado.error) throw resultado.error;
  return 1;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { snapshot?: Snapshot };
    const snapshot = body.snapshot;
    if (!snapshot) {
      return NextResponse.json({ ok: false, error: 'Snapshot ausente.' }, { status: 400 });
    }

    const totais = await Promise.all([
      upsertLista('categorias', snapshot.categorias),
      upsertLista('contas', snapshot.contas),
      upsertLista('cartoes', snapshot.cartoes),
      upsertLista('investimentos', snapshot.investimentos),
      upsertLista('metas', snapshot.metas),
      upsertLista('orcamentos', snapshot.orcamentos),
      upsertLista('reservas', snapshot.reservas),
      upsertLista('transacoes', snapshot.transacoes),
      upsertConfig(snapshot.config),
    ]);

    return NextResponse.json({
      ok: true,
      total: totais.reduce((soma, valor) => soma + valor, 0),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Erro ao resgatar dados locais para a nuvem.' },
      { status: 500 },
    );
  }
}
