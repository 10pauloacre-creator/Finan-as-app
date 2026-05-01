'use client';

import { supabase, isSupabaseConfigured } from './supabase';
import {
  Transacao, Categoria, ContaBancaria, CartaoCredito,
  Investimento, Meta, Orcamento, ConfiguracaoApp, Reserva,
} from '@/types';

type SyncEntity =
  | 'transacoes'
  | 'categorias'
  | 'contas'
  | 'cartoes'
  | 'investimentos'
  | 'metas'
  | 'orcamentos'
  | 'reservas'
  | 'configuracoes_app';

type PendingSyncOp = {
  id: string;
  entity: SyncEntity;
  action: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  createdAt: string;
};

type DadosSincronizaveis = {
  transacoes: Transacao[];
  categorias: Categoria[];
  contas: ContaBancaria[];
  cartoes: CartaoCredito[];
  investimentos: Investimento[];
  metas: Meta[];
  orcamentos: Orcamento[];
  reservas: Reserva[];
  config: ConfiguracaoApp | null;
};

const SYNC_QUEUE_KEY = 'fin_sync_queue';

function ok() {
  return isSupabaseConfigured();
}

function podeSincronizarAgora() {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function getQueue(): PendingSyncOp[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]') as PendingSyncOp[];
  } catch {
    return [];
  }
}

function setQueue(queue: PendingSyncOp[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function enqueue(op: Omit<PendingSyncOp, 'id' | 'createdAt'>) {
  const queue = getQueue();
  queue.push({
    ...op,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
  });
  setQueue(queue);
}

async function executarOperacao(op: PendingSyncOp) {
  if (op.action === 'upsert') {
    const { error } = await supabase.from(op.entity).upsert(op.payload);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from(op.entity).delete().eq('id', op.payload.id);
  if (error) throw error;
}

async function sincronizarOperacao(
  entity: SyncEntity,
  action: 'upsert' | 'delete',
  payload: Record<string, unknown>,
) {
  if (!ok()) return;

  const opBase = { entity, action, payload };
  if (!podeSincronizarAgora()) {
    enqueue(opBase);
    return;
  }

  try {
    await executarOperacao({
      ...opBase,
      id: 'live',
      createdAt: new Date().toISOString(),
    });
  } catch {
    enqueue(opBase);
  }
}

export async function processarFilaDeSincronizacao() {
  if (!ok() || !podeSincronizarAgora()) {
    return { processados: 0, pendentes: getQueue().length };
  }

  const queue = getQueue();
  if (!queue.length) return { processados: 0, pendentes: 0 };

  const restantes: PendingSyncOp[] = [];
  let processados = 0;

  for (const op of queue) {
    try {
      await executarOperacao(op);
      processados += 1;
    } catch {
      restantes.push(op);
    }
  }

  setQueue(restantes);
  return { processados, pendentes: restantes.length };
}

export function totalPendenciasDeSync() {
  return getQueue().length;
}

function mapTransacao(t: Transacao) {
  return {
    id: t.id,
    tipo: t.tipo,
    valor: t.valor,
    descricao: t.descricao,
    categoria_id: t.categoria_id,
    data: t.data,
    metodo_pagamento: t.metodo_pagamento,
    conta_id: t.conta_id,
    parcelas: t.parcelas,
    local: t.local,
    origem: t.origem,
    criado_em: t.criado_em,
  };
}

function mapCategoria(c: Categoria) {
  return {
    id: c.id,
    nome: c.nome,
    icone: c.icone,
    cor: c.cor,
    tipo: c.tipo,
    limite_mensal: c.limite_mensal,
    criado_em: c.criado_em,
  };
}

function mapConta(c: ContaBancaria) {
  return {
    id: c.id,
    banco: c.banco,
    nome: c.nome,
    tipo: c.tipo,
    saldo: c.saldo,
    criado_em: c.criado_em,
  };
}

function mapCartao(c: CartaoCredito) {
  return {
    id: c.id,
    banco: c.banco,
    nome: c.nome,
    limite: c.limite,
    fatura_atual: c.fatura_atual,
    dia_vencimento: c.dia_vencimento,
    dia_fechamento: c.dia_fechamento,
    bandeira: c.bandeira,
    criado_em: c.criado_em,
  };
}

function mapInvestimento(inv: Investimento) {
  return {
    id: inv.id,
    nome: inv.nome,
    tipo: inv.tipo,
    valor_investido: inv.valor_investido,
    valor_atual: inv.valor_atual,
    data_inicio: inv.data_inicio,
    data_vencimento: inv.data_vencimento,
    banco: inv.banco,
    taxa_rendimento: inv.taxa_rendimento,
    indice: inv.indice,
    isento_ir: inv.isento_ir,
    criado_em: inv.criado_em,
  };
}

function mapMeta(meta: Meta) {
  return {
    id: meta.id,
    descricao: meta.descricao,
    valor_alvo: meta.valor_alvo,
    valor_atual: meta.valor_atual,
    prazo: meta.prazo,
    icone: meta.icone,
    cor: meta.cor,
    criado_em: meta.criado_em,
  };
}

function mapOrcamento(orcamento: Orcamento) {
  return {
    id: orcamento.id,
    categoria_id: orcamento.categoria_id,
    valor_limite: orcamento.valor_limite,
    mes: orcamento.mes,
    ano: orcamento.ano,
    criado_em: orcamento.criado_em,
  };
}

function mapReserva(reserva: Reserva) {
  return {
    id: reserva.id,
    nome: reserva.nome,
    banco: reserva.banco,
    percentual_selic: reserva.percentual_selic,
    tem_meta: reserva.tem_meta,
    valor_meta: reserva.valor_meta,
    descricao: reserva.descricao,
    icone: reserva.icone,
    cor: reserva.cor,
    historico: reserva.historico,
    criado_em: reserva.criado_em,
  };
}

function mapConfig(config: ConfiguracaoApp) {
  return {
    id: 'default',
    pin: config.pin,
    tema: config.tema,
    moeda: config.moeda,
    selic_atual: config.selic_atual,
    cdi_atual: config.cdi_atual,
    ipca_atual: config.ipca_atual,
    selic_atualizado_em: config.selic_atualizado_em,
    whatsapp_numero_autorizado: config.whatsapp_numero_autorizado,
    notificacoes_ativas: config.notificacoes_ativas,
  };
}

// ── Transacoes ─────────────────────────────────────────

export async function syncSalvarTransacao(t: Transacao) {
  await sincronizarOperacao('transacoes', 'upsert', mapTransacao(t));
}

export async function syncExcluirTransacao(id: string) {
  await sincronizarOperacao('transacoes', 'delete', { id });
}

export async function syncCarregarTransacoes(): Promise<Transacao[]> {
  if (!ok()) return [];
  const { data, error } = await supabase.from('transacoes').select('*').order('data', { ascending: false });
  if (error) throw error;
  return (data || []) as Transacao[];
}

// ── Categorias ────────────────────────────────────────

export async function syncSalvarCategoria(c: Categoria) {
  await sincronizarOperacao('categorias', 'upsert', mapCategoria(c));
}

export async function syncCarregarCategorias(): Promise<Categoria[]> {
  if (!ok()) return [];
  const { data, error } = await supabase.from('categorias').select('*');
  if (error) throw error;
  return (data || []) as Categoria[];
}

// ── Contas ────────────────────────────────────────────

export async function syncSalvarConta(c: ContaBancaria) {
  await sincronizarOperacao('contas', 'upsert', mapConta(c));
}

export async function syncExcluirConta(id: string) {
  await sincronizarOperacao('contas', 'delete', { id });
}

export async function syncCarregarContas(): Promise<ContaBancaria[]> {
  if (!ok()) return [];
  const { data, error } = await supabase.from('contas').select('*');
  if (error) throw error;
  return (data || []) as ContaBancaria[];
}

// ── Cartoes ───────────────────────────────────────────

export async function syncSalvarCartao(c: CartaoCredito) {
  await sincronizarOperacao('cartoes', 'upsert', mapCartao(c));
}

export async function syncExcluirCartao(id: string) {
  await sincronizarOperacao('cartoes', 'delete', { id });
}

export async function syncCarregarCartoes(): Promise<CartaoCredito[]> {
  if (!ok()) return [];
  const { data, error } = await supabase.from('cartoes').select('*');
  if (error) throw error;
  return (data || []) as CartaoCredito[];
}

// ── Investimentos ─────────────────────────────────────

export async function syncSalvarInvestimento(inv: Investimento) {
  await sincronizarOperacao('investimentos', 'upsert', mapInvestimento(inv));
}

export async function syncExcluirInvestimento(id: string) {
  await sincronizarOperacao('investimentos', 'delete', { id });
}

export async function syncCarregarInvestimentos(): Promise<Investimento[]> {
  if (!ok()) return [];
  const { data, error } = await supabase.from('investimentos').select('*');
  if (error) throw error;
  return (data || []) as Investimento[];
}

// ── Metas ─────────────────────────────────────────────

export async function syncSalvarMeta(meta: Meta) {
  await sincronizarOperacao('metas', 'upsert', mapMeta(meta));
}

export async function syncExcluirMeta(id: string) {
  await sincronizarOperacao('metas', 'delete', { id });
}

export async function syncCarregarMetas(): Promise<Meta[]> {
  if (!ok()) return [];
  const { data, error } = await supabase.from('metas').select('*');
  if (error) throw error;
  return (data || []) as Meta[];
}

// ── Orcamentos ────────────────────────────────────────

export async function syncSalvarOrcamento(orcamento: Orcamento) {
  await sincronizarOperacao('orcamentos', 'upsert', mapOrcamento(orcamento));
}

export async function syncExcluirOrcamento(id: string) {
  await sincronizarOperacao('orcamentos', 'delete', { id });
}

export async function syncCarregarOrcamentos(): Promise<Orcamento[]> {
  if (!ok()) return [];
  const { data, error } = await supabase.from('orcamentos').select('*');
  if (error) throw error;
  return (data || []) as Orcamento[];
}

// ── Reservas ────────────────────────────────────────

export async function syncSalvarReserva(reserva: Reserva) {
  await sincronizarOperacao('reservas', 'upsert', mapReserva(reserva));
}

export async function syncExcluirReserva(id: string) {
  await sincronizarOperacao('reservas', 'delete', { id });
}

export async function syncCarregarReservas(): Promise<Reserva[]> {
  if (!ok()) return [];
  const { data, error } = await supabase.from('reservas').select('*');
  if (error) throw error;
  return (data || []) as Reserva[];
}

// ── Configuracao ──────────────────────────────────────

export async function syncSalvarConfig(config: ConfiguracaoApp) {
  await sincronizarOperacao('configuracoes_app', 'upsert', mapConfig(config));
}

export async function syncCarregarConfig(): Promise<ConfiguracaoApp | null> {
  if (!ok()) return null;
  const { data, error } = await supabase
    .from('configuracoes_app')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const config = { ...data } as Record<string, unknown>;
  delete config.id;
  return config as unknown as ConfiguracaoApp;
}

// ── Sync completo ─────────────────────────────────────

export async function baixarTudoDoSupabase(): Promise<DadosSincronizaveis> {
  const [transacoes, categorias, contas, cartoes, investimentos, metas, orcamentos, reservas, config] = await Promise.all([
    syncCarregarTransacoes(),
    syncCarregarCategorias(),
    syncCarregarContas(),
    syncCarregarCartoes(),
    syncCarregarInvestimentos(),
    syncCarregarMetas(),
    syncCarregarOrcamentos(),
    syncCarregarReservas(),
    syncCarregarConfig(),
  ]);

  return { transacoes, categorias, contas, cartoes, investimentos, metas, orcamentos, reservas, config };
}

export async function enviarTudoParaSupabase(dados: DadosSincronizaveis) {
  if (!ok()) return;

  await Promise.all([
    ...dados.transacoes.map(syncSalvarTransacao),
    ...dados.categorias.map(syncSalvarCategoria),
    ...dados.contas.map(syncSalvarConta),
    ...dados.cartoes.map(syncSalvarCartao),
    ...dados.investimentos.map(syncSalvarInvestimento),
    ...dados.metas.map(syncSalvarMeta),
    ...dados.orcamentos.map(syncSalvarOrcamento),
    ...dados.reservas.map(syncSalvarReserva),
    ...(dados.config ? [syncSalvarConfig(dados.config)] : []),
  ]);

  await processarFilaDeSincronizacao();
}
