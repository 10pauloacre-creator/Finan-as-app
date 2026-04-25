// ============================
// TIPOS GLOBAIS DO FINANCEIRO IA
// ============================

export type MetodoPagamento = 'pix' | 'debito' | 'credito' | 'dinheiro' | 'transferencia' | 'outro';
export type OrigemTransacao = 'manual' | 'whatsapp' | 'whatsapp_texto' | 'whatsapp_audio' | 'whatsapp_imagem' | 'extrato_foto' | 'open_banking';
export type TipoTransacao = 'despesa' | 'receita' | 'transferencia';
export type TipoInvestimento = 'tesouro_selic' | 'tesouro_ipca' | 'tesouro_prefixado' | 'cdb' | 'lci_lca' | 'acoes' | 'fundos_di' | 'poupanca' | 'cripto' | 'outro';
export type BandeirCartao = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard';
export type TipoConta = 'corrente' | 'poupanca' | 'digital' | 'investimento';
export type BancoSlug = 'nubank' | 'itau' | 'bradesco' | 'bb' | 'caixa' | 'inter' | 'c6' | 'santander' | 'outro';

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
  selic_atual?: number;
  cdi_atual?: number;
  ipca_atual?: number;
  selic_atualizado_em?: string;
  whatsapp_numero_autorizado?: string;
  notificacoes_ativas: boolean;
}

// ─── Helpers ─────────────────────────────────────────
export const BANCO_INFO: Record<BancoSlug, { nome: string; cor: string; corTexto: string }> = {
  nubank:    { nome: 'Nubank',         cor: '#820AD1', corTexto: '#FFFFFF' },
  itau:      { nome: 'Itaú',           cor: '#F08300', corTexto: '#FFFFFF' },
  bradesco:  { nome: 'Bradesco',       cor: '#CC092F', corTexto: '#FFFFFF' },
  bb:        { nome: 'Banco do Brasil',cor: '#F7D000', corTexto: '#003087' },
  caixa:     { nome: 'Caixa',          cor: '#005CA9', corTexto: '#FFFFFF' },
  inter:     { nome: 'Banco Inter',    cor: '#FF7A00', corTexto: '#FFFFFF' },
  c6:        { nome: 'C6 Bank',        cor: '#242424', corTexto: '#FFFFFF' },
  santander: { nome: 'Santander',      cor: '#EC0000', corTexto: '#FFFFFF' },
  outro:     { nome: 'Outro Banco',    cor: '#6B7280', corTexto: '#FFFFFF' },
};
