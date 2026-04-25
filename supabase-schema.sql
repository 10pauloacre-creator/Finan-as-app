-- FinanceiroIA — Schema Supabase
-- Cole este SQL no SQL Editor do Supabase e clique em Run

create table if not exists categorias (
  id          text primary key,
  nome        text not null,
  icone       text,
  cor         text,
  tipo        text default 'despesa',
  limite_mensal numeric default 0,
  criado_em   timestamptz default now()
);

create table if not exists transacoes (
  id                text primary key,
  tipo              text not null,
  valor             numeric not null,
  descricao         text not null,
  categoria_id      text references categorias(id),
  data              text not null,
  metodo_pagamento  text default 'pix',
  conta_id          text,
  parcelas          int,
  local             text,
  origem            text default 'manual',
  criado_em         timestamptz default now()
);

create table if not exists contas (
  id        text primary key,
  banco     text not null,
  nome      text not null,
  tipo      text default 'corrente',
  saldo     numeric default 0,
  criado_em timestamptz default now()
);

create table if not exists cartoes (
  id              text primary key,
  banco           text not null,
  nome            text not null,
  limite          numeric default 0,
  fatura_atual    numeric default 0,
  dia_vencimento  int default 15,
  dia_fechamento  int default 8,
  bandeira        text default 'mastercard',
  criado_em       timestamptz default now()
);

create table if not exists investimentos (
  id               text primary key,
  nome             text not null,
  tipo             text not null,
  valor_investido  numeric default 0,
  data_inicio      text not null,
  banco            text,
  taxa_rendimento  numeric,
  indice           text default 'cdi',
  isento_ir        boolean default false,
  criado_em        timestamptz default now()
);
