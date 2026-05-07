-- FinanceiroIA — Schema Supabase
-- Cole este SQL no SQL Editor do Supabase e clique em Run

-- ── Categorias ────────────────────────────────────────────────────────────────
create table if not exists categorias (
  id             text primary key,
  nome           text not null,
  icone          text,
  cor            text,
  tipo           text default 'despesa',
  limite_mensal  numeric default 0,
  criado_em      timestamptz default now()
);

-- ── Contas bancárias ──────────────────────────────────────────────────────────
create table if not exists contas (
  id                  text primary key,
  banco               text not null,
  nome                text not null,
  tipo                text default 'corrente',
  saldo               numeric default 0,
  pluggy_item_id      text,
  pluggy_account_id   text,
  pluggy_sync_em      timestamptz,
  criado_em           timestamptz default now()
);

-- ── Cartões de crédito ────────────────────────────────────────────────────────
create table if not exists cartoes (
  id                  text primary key,
  banco               text not null,
  nome                text not null,
  limite              numeric default 0,
  fatura_atual        numeric default 0,
  dia_vencimento      int default 15,
  dia_fechamento      int default 8,
  bandeira            text default 'mastercard',
  pluggy_item_id      text,
  pluggy_account_id   text,
  pluggy_sync_em      timestamptz,
  criado_em           timestamptz default now()
);

-- ── Transações ────────────────────────────────────────────────────────────────
create table if not exists transacoes (
  id                 text primary key,
  tipo               text not null,
  valor              numeric not null,
  descricao          text not null,
  categoria_id       text references categorias(id),
  data               text not null,
  horario            text,
  metodo_pagamento   text default 'pix',
  classificacao      text default 'padrao',
  conta_id           text,
  cartao_id          text,
  parcelas           int,
  local              text,
  origem             text default 'manual',
  comprovante_url    text,
  tags               jsonb,
  observacoes        text,
  itens_compra       jsonb,
  pluggy_id          text,
  pluggy_account_id  text,
  criado_em          timestamptz default now()
);

-- ── Investimentos ─────────────────────────────────────────────────────────────
create table if not exists investimentos (
  id               text primary key,
  nome             text not null,
  tipo             text not null,
  valor_investido  numeric default 0,
  valor_atual      numeric default 0,
  data_inicio      text,
  data_vencimento  text,
  banco            text,
  taxa_rendimento  numeric,
  indice           text default 'cdi',
  isento_ir        boolean default false,
  pluggy_id        text,
  criado_em        timestamptz default now()
);

-- ── Metas ───────────────────────────────────────────────────────────────
create table if not exists metas (
  id           text primary key,
  descricao    text not null,
  valor_alvo   numeric default 0,
  valor_atual  numeric default 0,
  prazo        text,
  icone        text,
  cor          text,
  criado_em    timestamptz default now()
);

-- ── Orçamentos ──────────────────────────────────────────────────────────
create table if not exists orcamentos (
  id            text primary key,
  categoria_id  text references categorias(id),
  valor_limite  numeric default 0,
  mes           int not null,
  ano           int not null,
  criado_em     timestamptz default now()
);

-- ── Reservas ───────────────────────────────────────────────
create table if not exists reservas (
  id                 text primary key,
  nome               text not null,
  banco              text not null,
  percentual_selic   numeric not null default 100,
  tem_meta           boolean not null default false,
  valor_meta         numeric,
  descricao          text,
  icone              text,
  cor                text,
  historico          jsonb not null default '[]'::jsonb,
  criado_em          timestamptz default now()
);

-- ── Configuração do app ─────────────────────────────────────────────────
create table if not exists configuracoes_app (
  id                           text primary key default 'default',
  pin                          text,
  tema                         text default 'escuro',
  moeda                        text default 'BRL',
  selic_atual                  numeric,
  cdi_atual                    numeric,
  ipca_atual                   numeric,
  selic_atualizado_em          timestamptz,
  whatsapp_numero_autorizado   text,
  notificacoes_ativas          boolean default true
);

-- ── Eventos de webhook (notificações Pluggy) ─────────────────────────────────
create table if not exists webhook_events (
  id          text primary key default gen_random_uuid()::text,
  event_type  text not null,
  item_id     text not null,
  synced      boolean default false,
  criado_em   timestamptz default now()
);
create index if not exists idx_webhook_events_synced   on webhook_events(synced);
create index if not exists idx_webhook_events_item     on webhook_events(item_id);

-- ── Empréstimos ───────────────────────────────────────────────────────────────
create table if not exists emprestimos (
  id                  text primary key,
  tipo                text not null,
  contratado          numeric default 0,
  saldo_devedor       numeric default 0,
  parcela_mensal      numeric,
  total_parcelas      int,
  parcelas_pagas      int,
  proximo_vencimento  text,
  pluggy_id           text,
  pluggy_item_id      text,
  criado_em           timestamptz default now()
);

-- ── Colunas novas em tabelas existentes (se já rodou o schema antigo) ─────────
alter table contas        add column if not exists pluggy_item_id      text;
alter table contas        add column if not exists pluggy_account_id   text;
alter table contas        add column if not exists pluggy_sync_em      timestamptz;
alter table cartoes       add column if not exists pluggy_item_id      text;
alter table cartoes       add column if not exists pluggy_account_id   text;
alter table cartoes       add column if not exists pluggy_sync_em      timestamptz;
alter table transacoes    add column if not exists pluggy_id           text;
alter table transacoes    add column if not exists pluggy_account_id   text;
alter table transacoes    add column if not exists horario             text;
alter table transacoes    add column if not exists cartao_id           text;
alter table transacoes    add column if not exists classificacao       text default 'padrao';
alter table transacoes    add column if not exists comprovante_url     text;
alter table transacoes    add column if not exists tags                jsonb;
alter table transacoes    add column if not exists observacoes         text;
alter table transacoes    add column if not exists itens_compra        jsonb;
alter table investimentos add column if not exists valor_atual         numeric default 0;
alter table investimentos add column if not exists data_vencimento     text;
alter table investimentos add column if not exists pluggy_id           text;
alter table investimentos alter column data_inicio drop not null;

-- ── Índices para performance (depois dos alters) ──────────────────────────────
create index if not exists idx_transacoes_data         on transacoes(data);
create index if not exists idx_transacoes_categoria    on transacoes(categoria_id);
create index if not exists idx_transacoes_pluggy       on transacoes(pluggy_id);
create index if not exists idx_contas_pluggy_item      on contas(pluggy_item_id);
create index if not exists idx_cartoes_pluggy_item     on cartoes(pluggy_item_id);
create index if not exists idx_investimentos_pluggy    on investimentos(pluggy_id);
create index if not exists idx_orcamentos_mes_ano      on orcamentos(mes, ano);
