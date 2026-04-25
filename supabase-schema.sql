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
  metodo_pagamento   text default 'pix',
  conta_id           text,
  parcelas           int,
  local              text,
  origem             text default 'manual',
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
