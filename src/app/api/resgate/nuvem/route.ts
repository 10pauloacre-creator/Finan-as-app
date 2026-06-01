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

function mapCategoria(registro: Record<string, unknown>) {
  const r = comDatas(registro);
  return {
    id: r.id,
    nome: r.nome,
    icone: r.icone,
    cor: r.cor,
    tipo: r.tipo,
    limite_mensal: r.limite_mensal,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

function mapConta(registro: Record<string, unknown>) {
  const r = comDatas(registro);
  return {
    id: r.id,
    banco: r.banco,
    nome: r.nome,
    tipo: r.tipo,
    saldo: r.saldo,
    saldo_base: r.saldo_base,
    pluggy_item_id: r.pluggy_item_id,
    pluggy_account_id: r.pluggy_account_id,
    pluggy_sync_em: r.pluggy_sync_em,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

function mapCartao(registro: Record<string, unknown>) {
  const r = comDatas(registro);
  return {
    id: r.id,
    banco: r.banco,
    nome: r.nome,
    limite: r.limite,
    fatura_atual: r.fatura_atual,
    fatura_ajuste_manual: r.fatura_ajuste_manual,
    dia_vencimento: r.dia_vencimento,
    dia_fechamento: r.dia_fechamento,
    bandeira: r.bandeira,
    pluggy_item_id: r.pluggy_item_id,
    pluggy_account_id: r.pluggy_account_id,
    pluggy_sync_em: r.pluggy_sync_em,
    ultima_fatura_paga_em: r.ultima_fatura_paga_em,
    ultima_fatura_paga_referencia: r.ultima_fatura_paga_referencia,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

function mapInvestimento(registro: Record<string, unknown>) {
  const r = comDatas(registro);
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    valor_investido: r.valor_investido,
    valor_atual: r.valor_atual,
    data_inicio: r.data_inicio,
    data_vencimento: r.data_vencimento,
    banco: r.banco,
    taxa_rendimento: r.taxa_rendimento,
    indice: r.indice,
    isento_ir: r.isento_ir,
    pluggy_id: r.pluggy_id,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

function mapMeta(registro: Record<string, unknown>) {
  const r = comDatas(registro);
  return {
    id: r.id,
    descricao: r.descricao,
    valor_alvo: r.valor_alvo,
    valor_atual: r.valor_atual,
    prazo: r.prazo,
    icone: r.icone,
    cor: r.cor,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

function mapOrcamento(registro: Record<string, unknown>) {
  const r = comDatas(registro);
  return {
    id: r.id,
    categoria_id: r.categoria_id,
    valor_limite: r.valor_limite,
    mes: r.mes,
    ano: r.ano,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

function mapReserva(registro: Record<string, unknown>) {
  const r = comDatas(registro);
  return {
    id: r.id,
    nome: r.nome,
    banco: r.banco,
    percentual_selic: r.percentual_selic,
    tem_meta: r.tem_meta,
    valor_meta: r.valor_meta,
    descricao: r.descricao,
    icone: r.icone,
    cor: r.cor,
    historico: r.historico,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

function mapTransacao(registro: Record<string, unknown>) {
  const r = comDatas(registro);
  return {
    id: r.id,
    tipo: r.tipo,
    valor: r.valor,
    descricao: r.descricao,
    categoria_id: r.categoria_id,
    data: r.data,
    data_cobranca: r.data_cobranca,
    horario: r.horario,
    metodo_pagamento: r.metodo_pagamento,
    classificacao: r.classificacao ?? 'padrao',
    conta_id: r.conta_id,
    cartao_id: r.cartao_id,
    parcelas: r.parcelas,
    parcela_atual: r.parcela_atual,
    local: r.local,
    origem: r.origem,
    comprovante_url: r.comprovante_url,
    tags: r.tags,
    observacoes: r.observacoes,
    itens_compra: r.itens_compra,
    datas_pagamento: r.datas_pagamento,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

function mapConfig(config: Record<string, unknown>) {
  return {
    id: 'default',
    pin: config.pin,
    tema: config.tema,
    moeda: config.moeda,
    ai_modelo_padrao: config.ai_modelo_padrao,
    ai_modelo_ocr_padrao: config.ai_modelo_ocr_padrao,
    selic_atual: config.selic_atual,
    cdi_atual: config.cdi_atual,
    ipca_atual: config.ipca_atual,
    selic_atualizado_em: config.selic_atualizado_em,
    notificacoes_ativas: config.notificacoes_ativas,
    atualizado_em: typeof config.atualizado_em === 'string' ? config.atualizado_em : agoraIso(),
  };
}

async function upsertLista(
  tabela: string,
  registros: Record<string, unknown>[] | undefined,
  mapRegistro: (registro: Record<string, unknown>) => Record<string, unknown>,
) {
  if (!registros?.length) return 0;
  const supabase = getSupabaseServer();
  const dados = registros.map(mapRegistro);
  let total = 0;

  for (let indice = 0; indice < dados.length; indice += 100) {
    const lote = dados.slice(indice, indice + 100);
    const resultado = await supabase.from(tabela).upsert(lote);
    if (resultado.error) {
      throw new Error(`[${tabela}] ${resultado.error.message}`);
    }
    total += lote.length;
  }

  return total;
}

async function upsertConfig(config: Record<string, unknown> | null | undefined) {
  if (!config) return 0;
  const supabase = getSupabaseServer();
  const payload = mapConfig(config);
  const resultado = await supabase.from('configuracoes_app').upsert(payload);
  if (resultado.error) throw new Error(`[configuracoes_app] ${resultado.error.message}`);
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
      upsertLista('categorias', snapshot.categorias, mapCategoria),
      upsertLista('contas', snapshot.contas, mapConta),
      upsertLista('cartoes', snapshot.cartoes, mapCartao),
      upsertLista('investimentos', snapshot.investimentos, mapInvestimento),
      upsertLista('metas', snapshot.metas, mapMeta),
      upsertLista('orcamentos', snapshot.orcamentos, mapOrcamento),
      upsertLista('reservas', snapshot.reservas, mapReserva),
      upsertLista('transacoes', snapshot.transacoes, mapTransacao),
      upsertConfig(snapshot.config),
    ]);

    return NextResponse.json({
      ok: true,
      total: totais.reduce((soma, valor) => soma + valor, 0),
    });
  } catch (error) {
    console.error('[resgate-nuvem] falha', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Erro ao resgatar dados locais para a nuvem.' },
      { status: 500 },
    );
  }
}
