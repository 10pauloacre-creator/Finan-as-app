// ============================
// TIPOS GLOBAIS DO FINANCEIRO IA
// ============================

import type { AIModelId } from '@/lib/ai/catalog';

export type MetodoPagamento = 'pix' | 'debito' | 'credito' | 'dinheiro' | 'transferencia' | 'outro';
export type OrigemTransacao = 'manual' | 'extrato_foto' | 'open_banking' | 'assistente' | 'assistente_audio' | 'assistente_imagem';
export type TipoTransacao = 'despesa' | 'receita' | 'transferencia';
export type TipoInvestimento = 'tesouro_selic' | 'tesouro_ipca' | 'tesouro_prefixado' | 'cdb' | 'lci_lca' | 'acoes' | 'fundos_di' | 'poupanca' | 'cripto' | 'outro';
export type BandeirCartao = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard';
export type TipoConta = 'corrente' | 'poupanca' | 'digital' | 'investimento';
export type BancoSlug = 'nubank' | 'itau' | 'bradesco' | 'bb' | 'caixa' | 'inter' | 'c6' | 'santander' | 'mercadopago' | 'outro';

// ─── Contas Bancárias ─────────────────────────────────
export interface ContaBancaria {
  id: string;
  banco: BancoSlug;
  nome: string;
  tipo: TipoConta;
  saldo: number;
  agencia?: string;
  conta?: string;
  pluggy_item_id?: string;      // ID do item Pluggy (quando conectado via Open Finance)
  pluggy_account_id?: string;   // ID da conta no Pluggy
  pluggy_sync_em?: string;      // ISO timestamp da última sincronização
  criado_em: string;
}

// ─── Cartões de Crédito ───────────────────────────────
export interface CartaoCredito {
  id: string;
  banco: BancoSlug;
  nome: string;
  limite: number;
  fatura_atual: number;
  dia_vencimento: number;
  dia_fechamento: number;
  bandeira: BandeirCartao;
  pluggy_item_id?: string;
  pluggy_account_id?: string;
  pluggy_sync_em?: string;
  criado_em: string;
}

// ─── Categorias ───────────────────────────────────────
export interface Categoria {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  limite_mensal?: number;
  tipo: TipoTransacao;
  criado_em: string;
}

export interface ItemCompra {
  nome: string;
  valor: number | null;
  quantidade?: number | null;
  unidade?: string | null;
}

// ─── Transações ───────────────────────────────────────
export interface Transacao {
  id: string;
  valor: number;
  descricao: string;
  categoria_id: string;
  categoria?: Categoria;
  conta_id?: string;           // conta bancária vinculada
  cartao_id?: string;          // cartão de crédito vinculado
  data: string;                // YYYY-MM-DD
  horario?: string;            // HH:mm
  tipo: TipoTransacao;
  metodo_pagamento?: MetodoPagamento;
  parcelas?: number;
  parcela_atual?: number;
  local?: string;
  latitude?: number;
  longitude?: number;
  comprovante_url?: string;
  origem: OrigemTransacao;
  tags?: string[];
  itens_compra?: ItemCompra[];
  observacoes?: string;
  criado_em: string;
}

// ─── Investimentos ────────────────────────────────────
export interface Investimento {
  id: string;
  nome: string;
  tipo: TipoInvestimento;
  valor_investido: number;
  valor_atual?: number;
  data_inicio: string;
  data_vencimento?: string;
  banco?: string;
  taxa_rendimento?: number;  // % ao ano ou % CDI
  indice: 'prefixado' | 'cdi' | 'selic' | 'ipca' | 'poupanca';
  isento_ir: boolean;
  criado_em: string;
}

// ─── Metas ────────────────────────────────────────────
export interface Meta {
  id: string;
  descricao: string;
  valor_alvo: number;
  valor_atual: number;
  prazo?: string;
  icone?: string;
  cor?: string;
  criado_em: string;
}

export interface MovimentoReserva {
  id: string;
  tipo: 'deposito' | 'retirada';
  valor: number;
  data: string;
  descricao?: string;
}

export interface Reserva {
  id: string;
  nome: string;
  banco: BancoSlug;
  percentual_selic: number;
  tem_meta: boolean;
  valor_meta?: number;
  descricao?: string;
  icone: string;
  cor: string;
  historico: MovimentoReserva[];
  criado_em: string;
}

// ─── Orçamento ────────────────────────────────────────
export interface Orcamento {
  id: string;
  categoria_id: string;
  categoria?: Categoria;
  valor_limite: number;
  mes: number;
  ano: number;
  criado_em: string;
}

// ─── IA ───────────────────────────────────────────────
export interface DicaIA {
  id: string;
  tipo: 'alerta' | 'dica' | 'conquista' | 'previsao';
  titulo: string;
  mensagem: string;
  icone?: string;
  acao?: string;
  criado_em: string;
}

// ─── Configurações ────────────────────────────────────
export interface ConfiguracaoApp {
  pin?: string;
  tema: 'claro' | 'escuro' | 'sistema';
  moeda: string;
  ai_modelo_padrao?: AIModelId;
  ai_modelo_ocr_padrao?: AIModelId;
  selic_atual?: number;
  cdi_atual?: number;
  ipca_atual?: number;
  selic_atualizado_em?: string;
  notificacoes_ativas: boolean;
}

// ─── Helpers ─────────────────────────────────────────
export const BANCO_INFO: Record<BancoSlug, { nome: string; cor: string; corTexto: string; logoUrl?: string }> = {
  nubank:    { nome: 'Nubank',         cor: '#820AD1', corTexto: '#FFFFFF', logoUrl: 'https://nubank.com.br/favicon.ico' },
  itau:      { nome: 'Itaú',           cor: '#F08300', corTexto: '#FFFFFF', logoUrl: 'https://www.itau.com.br/favicon.ico' },
  bradesco:  { nome: 'Bradesco',       cor: '#CC092F', corTexto: '#FFFFFF', logoUrl: 'https://banco.bradesco/favicon.ico' },
  bb:        { nome: 'Banco do Brasil',cor: '#F7D000', corTexto: '#003087', logoUrl: 'https://www.bb.com.br/favicon.ico' },
  caixa:     { nome: 'Caixa',          cor: '#005CA9', corTexto: '#FFFFFF', logoUrl: 'https://www.caixa.gov.br/favicon.ico' },
  inter:     { nome: 'Banco Inter',    cor: '#FF7A00', corTexto: '#FFFFFF', logoUrl: 'https://inter.co/favicon.ico' },
  c6:        { nome: 'C6 Bank',        cor: '#242424', corTexto: '#FFFFFF', logoUrl: 'https://www.c6bank.com.br/favicon.ico' },
  santander: { nome: 'Santander',      cor: '#EC0000', corTexto: '#FFFFFF', logoUrl: 'https://www.santander.com.br/favicon.ico' },
  mercadopago: { nome: 'Mercado Pago', cor: '#00B1EA', corTexto: '#FFFFFF', logoUrl: 'https://www.mercadopago.com.br/favicon.ico' },
  outro:     { nome: 'Outro Banco',    cor: '#6B7280', corTexto: '#FFFFFF' },
};
