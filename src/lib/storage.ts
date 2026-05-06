/**
 * STORAGE LOCAL — armazena dados no navegador quando offline
 */

import { Transacao, Categoria, Investimento, Meta, ConfiguracaoApp, ContaBancaria, CartaoCredito, Orcamento, Reserva } from '@/types';
import { CATEGORIAS_PADRAO } from './categorias-padrao';
import { isSameFinancialMonth, parseFinancialDate } from './date';

const KEYS = {
  TRANSACOES:   'fin_transacoes',
  CATEGORIAS:   'fin_categorias',
  INVESTIMENTOS:'fin_investimentos',
  METAS:        'fin_metas',
  CONFIG:       'fin_config',
  CONTAS:       'fin_contas',
  CARTOES:      'fin_cartoes',
  ORCAMENTOS:   'fin_orcamentos',
  RESERVAS:     'fin_reservas',
};

export const FINANCEIRO_STORAGE_EVENT = 'financeiroia:storage-changed';
const STORAGE_SYNC_KEY = 'fin_storage_last_change';

function notifyStorageChange(changedKey: string): void {
  if (typeof window === 'undefined') return;

  const detail = { key: changedKey, ts: Date.now() };
  localStorage.setItem(STORAGE_SYNC_KEY, JSON.stringify(detail));
  window.dispatchEvent(new CustomEvent(FINANCEIRO_STORAGE_EVENT, { detail }));
}

function get<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}
function set<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  notifyStorageChange(key);
}
function getObj<T>(key: string, def: T): T {
  if (typeof window === 'undefined') return def;
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; }
  catch { return def; }
}
function setObj<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  notifyStorageChange(key);
}

// Contas bancárias pré-cadastradas (Nubank e Itaú)
const CONTAS_PADRAO: ContaBancaria[] = [
  {
    id: 'conta-nubank',
    banco: 'nubank',
    nome: 'Nubank — Conta Digital',
    tipo: 'digital',
    saldo: 0,
    criado_em: new Date().toISOString(),
  },
  {
    id: 'conta-itau',
    banco: 'itau',
    nome: 'Itaú — Conta Corrente',
    tipo: 'corrente',
    saldo: 0,
    criado_em: new Date().toISOString(),
  },
];

const CARTOES_PADRAO: CartaoCredito[] = [
  {
    id: 'cartao-nubank',
    banco: 'nubank',
    nome: 'Nubank Roxinho',
    limite: 5000,
    fatura_atual: 0,
    dia_vencimento: 15,
    dia_fechamento: 8,
    bandeira: 'mastercard',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'cartao-itau',
    banco: 'itau',
    nome: 'Itaú Mastercard',
    limite: 8000,
    fatura_atual: 0,
    dia_vencimento: 22,
    dia_fechamento: 15,
    bandeira: 'mastercard',
    criado_em: new Date().toISOString(),
  },
];

// ── TRANSAÇÕES ──────────────────────────────────────────
export const storageTransacoes = {
  getAll: (): Transacao[] => get<Transacao>(KEYS.TRANSACOES),
  replaceAll: (lista: Transacao[]): void => set(KEYS.TRANSACOES, lista),
  save: (t: Transacao): void => {
    const lista = get<Transacao>(KEYS.TRANSACOES);
    const idx = lista.findIndex(x => x.id === t.id);
    if (idx >= 0) lista[idx] = t; else lista.unshift(t);
    set(KEYS.TRANSACOES, lista);
  },
  delete: (id: string): void => set(KEYS.TRANSACOES, get<Transacao>(KEYS.TRANSACOES).filter(x => x.id !== id)),
  getByMes: (mes: number, ano: number): Transacao[] =>
    get<Transacao>(KEYS.TRANSACOES).filter(t => isSameFinancialMonth(t.data, mes, ano)),
};

// ── CATEGORIAS ──────────────────────────────────────────
export const storageCategoriass = {
  getAll: (): Categoria[] => {
    const salvas = get<Categoria>(KEYS.CATEGORIAS);
    if (salvas.length === 0) {
      const padrao = CATEGORIAS_PADRAO.map(c => ({ ...c, criado_em: new Date().toISOString() }));
      set(KEYS.CATEGORIAS, padrao);
      return padrao;
    }
    const idsSalvos = new Set(salvas.map((categoria) => categoria.id));
    const faltantes = CATEGORIAS_PADRAO
      .filter((categoria) => !idsSalvos.has(categoria.id))
      .map((categoria) => ({ ...categoria, criado_em: new Date().toISOString() }));
    if (faltantes.length === 0) return salvas;

    const atualizadas = [...salvas, ...faltantes];
    set(KEYS.CATEGORIAS, atualizadas);
    return atualizadas;
  },
  replaceAll: (lista: Categoria[]): void => set(KEYS.CATEGORIAS, lista),
  save: (c: Categoria): void => {
    const lista = get<Categoria>(KEYS.CATEGORIAS);
    const idx = lista.findIndex(x => x.id === c.id);
    if (idx >= 0) lista[idx] = c; else lista.push(c);
    set(KEYS.CATEGORIAS, lista);
  },
};

// ── CONTAS BANCÁRIAS ────────────────────────────────────
export const storageContas = {
  getAll: (): ContaBancaria[] => {
    const salvas = get<ContaBancaria>(KEYS.CONTAS);
    if (salvas.length === 0) { set(KEYS.CONTAS, CONTAS_PADRAO); return CONTAS_PADRAO; }
    return salvas;
  },
  replaceAll: (lista: ContaBancaria[]): void => set(KEYS.CONTAS, lista),
  save: (c: ContaBancaria): void => {
    const lista = get<ContaBancaria>(KEYS.CONTAS);
    const idx = lista.findIndex(x => x.id === c.id);
    if (idx >= 0) lista[idx] = c; else lista.unshift(c);
    set(KEYS.CONTAS, lista);
  },
  delete: (id: string): void => set(KEYS.CONTAS, get<ContaBancaria>(KEYS.CONTAS).filter(x => x.id !== id)),
};

// ── CARTÕES DE CRÉDITO ──────────────────────────────────
export const storageCartoes = {
  getAll: (): CartaoCredito[] => {
    const salvas = get<CartaoCredito>(KEYS.CARTOES);
    if (salvas.length === 0) { set(KEYS.CARTOES, CARTOES_PADRAO); return CARTOES_PADRAO; }
    return salvas;
  },
  replaceAll: (lista: CartaoCredito[]): void => set(KEYS.CARTOES, lista),
  save: (c: CartaoCredito): void => {
    const lista = get<CartaoCredito>(KEYS.CARTOES);
    const idx = lista.findIndex(x => x.id === c.id);
    if (idx >= 0) lista[idx] = c; else lista.unshift(c);
    set(KEYS.CARTOES, lista);
  },
  delete: (id: string): void => set(KEYS.CARTOES, get<CartaoCredito>(KEYS.CARTOES).filter(x => x.id !== id)),
};

// ── INVESTIMENTOS ───────────────────────────────────────
export const storageInvestimentos = {
  getAll: (): Investimento[] => get<Investimento>(KEYS.INVESTIMENTOS),
  replaceAll: (lista: Investimento[]): void => set(KEYS.INVESTIMENTOS, lista),
  save: (inv: Investimento): void => {
    const lista = get<Investimento>(KEYS.INVESTIMENTOS);
    const idx = lista.findIndex(x => x.id === inv.id);
    if (idx >= 0) lista[idx] = inv; else lista.unshift(inv);
    set(KEYS.INVESTIMENTOS, lista);
  },
  delete: (id: string): void => set(KEYS.INVESTIMENTOS, get<Investimento>(KEYS.INVESTIMENTOS).filter(x => x.id !== id)),
};

// ── METAS ───────────────────────────────────────────────
export const storageMetas = {
  getAll: (): Meta[] => get<Meta>(KEYS.METAS),
  replaceAll: (lista: Meta[]): void => set(KEYS.METAS, lista),
  save: (m: Meta): void => {
    const lista = get<Meta>(KEYS.METAS);
    const idx = lista.findIndex(x => x.id === m.id);
    if (idx >= 0) lista[idx] = m; else lista.unshift(m);
    set(KEYS.METAS, lista);
  },
  delete: (id: string): void => set(KEYS.METAS, get<Meta>(KEYS.METAS).filter(x => x.id !== id)),
};

// ── ORÇAMENTOS ──────────────────────────────────────────
export const storageOrcamentos = {
  getAll: (): Orcamento[] => get<Orcamento>(KEYS.ORCAMENTOS),
  replaceAll: (lista: Orcamento[]): void => set(KEYS.ORCAMENTOS, lista),
  getByMes: (mes: number, ano: number): Orcamento[] =>
    get<Orcamento>(KEYS.ORCAMENTOS).filter(o => o.mes === mes && o.ano === ano),
  save: (o: Orcamento): void => {
    const lista = get<Orcamento>(KEYS.ORCAMENTOS);
    const idx = lista.findIndex(x => x.id === o.id);
    if (idx >= 0) lista[idx] = o; else lista.push(o);
    set(KEYS.ORCAMENTOS, lista);
  },
  delete: (id: string): void =>
    set(KEYS.ORCAMENTOS, get<Orcamento>(KEYS.ORCAMENTOS).filter(x => x.id !== id)),
};

// ── RESERVAS ─────────────────────────────────────────
export const storageReservas = {
  getAll: (): Reserva[] => get<Reserva>(KEYS.RESERVAS),
  replaceAll: (lista: Reserva[]): void => set(KEYS.RESERVAS, lista),
  save: (reserva: Reserva): void => {
    const lista = get<Reserva>(KEYS.RESERVAS);
    const idx = lista.findIndex((item) => item.id === reserva.id);
    if (idx >= 0) lista[idx] = reserva; else lista.unshift(reserva);
    set(KEYS.RESERVAS, lista);
  },
  delete: (id: string): void => set(KEYS.RESERVAS, get<Reserva>(KEYS.RESERVAS).filter((item) => item.id !== id)),
};

// ── CONFIGURAÇÕES ───────────────────────────────────────
const CONFIG_DEFAULT: ConfiguracaoApp = {
  tema: 'escuro',
  moeda: 'BRL',
  notificacoes_ativas: true,
  ai_modelo_padrao: 'automatico',
  ai_modelo_ocr_padrao: 'automatico',
};
export const storageConfig = {
  get: (): ConfiguracaoApp => getObj<ConfiguracaoApp>(KEYS.CONFIG, CONFIG_DEFAULT),
  replace: (config: ConfiguracaoApp): void => setObj(KEYS.CONFIG, config),
  set: (c: Partial<ConfiguracaoApp>): void =>
    setObj(KEYS.CONFIG, { ...getObj<ConfiguracaoApp>(KEYS.CONFIG, CONFIG_DEFAULT), ...c }),
};

// ── UTILS ───────────────────────────────────────────────
export function gerarId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}
export function formatarData(data: string): string {
  return parseFinancialDate(data).toLocaleDateString('pt-BR');
}
export function mesAtual(): { mes: number; ano: number } {
  const hoje = new Date();
  return { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };
}
