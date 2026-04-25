'use client';

import { supabase, isSupabaseConfigured } from './supabase';
import { Transacao, Categoria, ContaBancaria, CartaoCredito, Investimento } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function ok() { return isSupabaseConfigured(); }

// ── Transações ─────────────────────────────────────────────────────────────

export async function syncSalvarTransacao(t: Transacao) {
  if (!ok()) return;
  await supabase.from('transacoes').upsert({
    id: t.id, tipo: t.tipo, valor: t.valor, descricao: t.descricao,
    categoria_id: t.categoria_id, data: t.data,
    metodo_pagamento: t.metodo_pagamento, conta_id: t.conta_id,
    parcelas: t.parcelas, local: t.local, origem: t.origem,
    criado_em: t.criado_em,
  });
}

export async function syncExcluirTransacao(id: string) {
  if (!ok()) return;
  await supabase.from('transacoes').delete().eq('id', id);
}

export async function syncCarregarTransacoes(): Promise<Transacao[]> {
  if (!ok()) return [];
  const { data } = await supabase.from('transacoes').select('*').order('data', { ascending: false });
  return (data || []) as Transacao[];
}

// ── Categorias ─────────────────────────────────────────────────────────────

export async function syncSalvarCategoria(c: Categoria) {
  if (!ok()) return;
  await supabase.from('categorias').upsert({
    id: c.id, nome: c.nome, icone: c.icone, cor: c.cor,
    tipo: c.tipo, limite_mensal: c.limite_mensal, criado_em: c.criado_em,
  });
}

export async function syncCarregarCategorias(): Promise<Categoria[]> {
  if (!ok()) return [];
  const { data } = await supabase.from('categorias').select('*');
  return (data || []) as Categoria[];
}

// ── Contas ─────────────────────────────────────────────────────────────────

export async function syncSalvarConta(c: ContaBancaria) {
  if (!ok()) return;
  await supabase.from('contas').upsert({
    id: c.id, banco: c.banco, nome: c.nome,
    tipo: c.tipo, saldo: c.saldo, criado_em: c.criado_em,
  });
}

export async function syncExcluirConta(id: string) {
  if (!ok()) return;
  await supabase.from('contas').delete().eq('id', id);
}

export async function syncCarregarContas(): Promise<ContaBancaria[]> {
  if (!ok()) return [];
  const { data } = await supabase.from('contas').select('*');
  return (data || []) as ContaBancaria[];
}

// ── Cartões ────────────────────────────────────────────────────────────────

export async function syncSalvarCartao(c: CartaoCredito) {
  if (!ok()) return;
  await supabase.from('cartoes').upsert({
    id: c.id, banco: c.banco, nome: c.nome, limite: c.limite,
    fatura_atual: c.fatura_atual, dia_vencimento: c.dia_vencimento,
    dia_fechamento: c.dia_fechamento, bandeira: c.bandeira, criado_em: c.criado_em,
  });
}

export async function syncExcluirCartao(id: string) {
  if (!ok()) return;
  await supabase.from('cartoes').delete().eq('id', id);
}

export async function syncCarregarCartoes(): Promise<CartaoCredito[]> {
  if (!ok()) return [];
  const { data } = await supabase.from('cartoes').select('*');
  return (data || []) as CartaoCredito[];
}

// ── Investimentos ──────────────────────────────────────────────────────────

export async function syncSalvarInvestimento(inv: Investimento) {
  if (!ok()) return;
  await supabase.from('investimentos').upsert({
    id: inv.id, nome: inv.nome, tipo: inv.tipo,
    valor_investido: inv.valor_investido, data_inicio: inv.data_inicio,
    banco: inv.banco, taxa_rendimento: inv.taxa_rendimento,
    indice: inv.indice, isento_ir: inv.isento_ir, criado_em: inv.criado_em,
  });
}

export async function syncExcluirInvestimento(id: string) {
  if (!ok()) return;
  await supabase.from('investimentos').delete().eq('id', id);
}

export async function syncCarregarInvestimentos(): Promise<Investimento[]> {
  if (!ok()) return [];
  const { data } = await supabase.from('investimentos').select('*');
  return (data || []) as Investimento[];
}

// ── Sync completo (baixar tudo do Supabase) ────────────────────────────────

export async function baixarTudoDoSupabase() {
  const [transacoes, categorias, contas, cartoes, investimentos] = await Promise.all([
    syncCarregarTransacoes(),
    syncCarregarCategorias(),
    syncCarregarContas(),
    syncCarregarCartoes(),
    syncCarregarInvestimentos(),
  ]);
  return { transacoes, categorias, contas, cartoes, investimentos };
}

// ── Upload completo (enviar tudo ao Supabase) ──────────────────────────────

export async function enviarTudoParaSupabase(dados: {
  transacoes:    Transacao[];
  categorias:    Categoria[];
  contas:        ContaBancaria[];
  cartoes:       CartaoCredito[];
  investimentos: Investimento[];
}) {
  if (!ok()) return;
  await Promise.all([
    ...dados.transacoes.map(syncSalvarTransacao),
    ...dados.categorias.map(syncSalvarCategoria),
    ...dados.contas.map(syncSalvarConta),
    ...dados.cartoes.map(syncSalvarCartao),
    ...dados.investimentos.map(syncSalvarInvestimento),
  ]);
}
