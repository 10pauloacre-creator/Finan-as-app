import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  Transacao, Categoria, Investimento, Meta, ConfiguracaoApp,
  DicaIA, ContaBancaria, CartaoCredito, Orcamento, BANCO_INFO,
} from '@/types';
import {
  storageTransacoes, storageCategoriass, storageInvestimentos,
  storageMetas, storageConfig, storageContas, storageCartoes, storageOrcamentos, storageReservas,
  FINANCEIRO_STORAGE_EVENT, gerarId,
} from '@/lib/storage';
import {
  syncSalvarTransacao, syncExcluirTransacao,
  syncSalvarCategoria,
  syncSalvarConta, syncExcluirConta,
  syncSalvarCartao, syncExcluirCartao,
  syncSalvarInvestimento, syncExcluirInvestimento,
  syncSalvarMeta, syncExcluirMeta,
  syncSalvarOrcamento, syncExcluirOrcamento,
  syncSalvarConfig,
  baixarTudoDoSupabase, enviarTudoParaSupabase, processarFilaDeSincronizacao, totalPendenciasDeSync, SYNC_TABLES,
} from '@/lib/sync';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { formatFinancialDate, startOfTodayLocal } from '@/lib/date';
import {
  contarOcorrenciasAteData,
  getDataCobrancaCartaoParaData,
  getDataOcorrenciaNoMes,
  ocorrenciaEstaPaga,
  registrarPagamentoOcorrencia,
  removerPagamentoOcorrencia,
} from '@/lib/transacoes';

interface FinanceiroState {
  transacoes: Transacao[];
  categorias: Categoria[];
  investimentos: Investimento[];
  metas: Meta[];
  contas: ContaBancaria[];
  cartoes: CartaoCredito[];
  orcamentos: Orcamento[];
  config: ConfiguracaoApp;
  dicasIA: DicaIA[];
  autenticado: boolean;
  selicAtual: number | null;
  cdiAtual: number | null;
  ipcaAtual: number | null;

  autenticar: (pin: string) => boolean;
  desautenticar: () => void;
  carregarDados: () => void;

  adicionarTransacao: (t: Omit<Transacao, 'id' | 'criado_em'>) => Transacao;
  editarTransacao: (id: string, dados: Partial<Transacao>) => void;
  excluirTransacao: (id: string) => void;
  marcarTransacaoComoPaga: (id: string, dataOcorrencia: string) => void;
  desmarcarTransacaoComoPaga: (id: string, dataOcorrencia: string) => void;
  marcarFaturaCartaoComoPaga: (cartaoId: string, pagamentos: Array<{ transacaoId: string; dataOcorrencia: string }>) => void;

  adicionarCategoria: (c: Omit<Categoria, 'id' | 'criado_em'>) => void;

  atualizarSaldoConta: (id: string, saldo: number) => void;
  adicionarConta: (c: Omit<ContaBancaria, 'id' | 'criado_em'>) => void;
  excluirConta: (id: string) => void;

  atualizarFaturaCartao: (id: string, fatura: number) => void;
  adicionarCartao: (c: Omit<CartaoCredito, 'id' | 'criado_em'>) => void;
  editarCartao: (id: string, dados: Partial<CartaoCredito>) => void;
  excluirCartao: (id: string) => void;

  adicionarInvestimento: (inv: Omit<Investimento, 'id' | 'criado_em'>) => void;
  excluirInvestimento: (id: string) => void;

  adicionarMeta: (m: Omit<Meta, 'id' | 'criado_em'>) => void;
  atualizarMeta: (id: string, valor_atual: number) => void;
  excluirMeta: (id: string) => void;

  adicionarOrcamento: (o: Omit<Orcamento, 'id' | 'criado_em'>) => void;
  editarOrcamento: (id: string, dados: Partial<Orcamento>) => void;
  excluirOrcamento: (id: string) => void;

  atualizarConfig: (c: Partial<ConfiguracaoApp>) => void;
  setTaxas: (selic: number, cdi: number, ipca: number) => void;
  setDicasIA: (dicas: DicaIA[]) => void;

  sincronizarDoSupabase: () => Promise<{ ok: boolean; msg: string }>;
  enviarParaNuvem: () => Promise<{ ok: boolean; msg: string }>;
}

const CONFIG_DEFAULT: ConfiguracaoApp = {
  tema: 'escuro',
  moeda: 'BRL',
  notificacoes_ativas: true,
  ai_modelo_padrao: 'automatico',
  ai_modelo_ocr_padrao: 'automatico',
};

let listenersDeSyncRegistrados = false;
let syncEmAndamento: Promise<void> | null = null;
let intervaloDeSync: ReturnType<typeof setInterval> | null = null;
let canalRealtimeDeSync: RealtimeChannel | null = null;
let timeoutDeSyncRemoto: number | null = null;
let supressaoDeRecargaLocal = 0;

function arredondarMoeda(valor: number) {
  return Number(valor.toFixed(2));
}

function normalizarTexto(valor: string | undefined) {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function inferirContaIdPorTexto(transacao: Pick<Transacao, 'descricao' | 'local' | 'observacoes'>, contas: ContaBancaria[]) {
  const textos = [transacao.descricao, transacao.local, transacao.observacoes]
    .map((valor) => normalizarTexto(valor))
    .filter(Boolean);

  if (!textos.length) return undefined;

  const candidatas = contas.filter((conta) => {
    const nomeConta = normalizarTexto(conta.nome);
    const nomeBanco = normalizarTexto(BANCO_INFO[conta.banco]?.nome);
    return textos.some((texto) => texto === nomeConta || texto === nomeBanco);
  });

  return candidatas.length === 1 ? candidatas[0].id : undefined;
}

function normalizarTransacaoRelacionamentos(
  transacao: Transacao,
  categorias: Categoria[],
  contas: ContaBancaria[],
) {
  const categoria = categorias.find((item) => item.id === transacao.categoria_id);
  const tipoAjustado = categoria?.tipo === 'transferencia' ? 'transferencia' : transacao.tipo;
  const metodoAjustado = tipoAjustado === 'transferencia' && transacao.metodo_pagamento === 'credito'
    ? 'pix'
    : transacao.metodo_pagamento;
  const cartaoAjustado = tipoAjustado === 'transferencia' ? undefined : transacao.cartao_id;
  const contaInferida = !cartaoAjustado && !transacao.conta_id
    ? inferirContaIdPorTexto(transacao, contas)
    : undefined;
  const contaAjustada = cartaoAjustado ? undefined : (transacao.conta_id || contaInferida);

  if (
    tipoAjustado === transacao.tipo
    && metodoAjustado === transacao.metodo_pagamento
    && cartaoAjustado === transacao.cartao_id
    && contaAjustada === transacao.conta_id
  ) {
    return transacao;
  }

  return {
    ...transacao,
    tipo: tipoAjustado,
    metodo_pagamento: metodoAjustado,
    cartao_id: cartaoAjustado,
    conta_id: contaAjustada,
  };
}

function normalizarTransacoesParaEstado(
  transacoes: Transacao[],
  categorias: Categoria[],
  contas: ContaBancaria[],
  sync = false,
) {
  return transacoes.map((transacao) => {
    const normalizada = normalizarTransacaoRelacionamentos(transacao, categorias, contas);
    if (normalizada === transacao) return transacao;
    storageTransacoes.save(normalizada);
    if (sync) {
      void syncSalvarTransacao(normalizada);
    }
    return normalizada;
  });
}

function getMarcaAtualizacaoTransacao(transacao: Pick<Transacao, 'atualizado_em' | 'criado_em'>) {
  const marca = transacao.atualizado_em || transacao.criado_em;
  const timestamp = marca ? new Date(marca).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getMarcaAtualizacaoRegistro<T extends { atualizado_em?: string; criado_em?: string }>(registro: T | null | undefined) {
  const marca = registro?.atualizado_em || registro?.criado_em;
  const timestamp = marca ? new Date(marca).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mesclarRegistrosPorAtualizacao<T extends { id: string; atualizado_em?: string; criado_em?: string }>(
  remotos: T[],
  locais: T[],
) {
  const porId = new Map<string, T>();

  for (const remoto of remotos) {
    porId.set(remoto.id, remoto);
  }

  for (const local of locais) {
    const remoto = porId.get(local.id);
    if (!remoto || getMarcaAtualizacaoRegistro(local) > getMarcaAtualizacaoRegistro(remoto)) {
      porId.set(local.id, local);
    }
  }

  return [...porId.values()];
}

function mesclarConfigPorAtualizacao(remota: ConfiguracaoApp | null, local: ConfiguracaoApp) {
  if (!remota) return local;
  return getMarcaAtualizacaoRegistro(local) > getMarcaAtualizacaoRegistro(remota) ? local : remota;
}

function mesclarTransacoesPorAtualizacao(remotas: Transacao[], locais: Transacao[]) {
  const porId = new Map<string, Transacao>();

  for (const transacao of remotas) {
    porId.set(transacao.id, transacao);
  }

  for (const local of locais) {
    const remota = porId.get(local.id);
    if (!remota || getMarcaAtualizacaoTransacao(local) > getMarcaAtualizacaoTransacao(remota)) {
      porId.set(local.id, local);
    }
  }

  return [...porId.values()];
}

function executarSemRecargaLocal<T>(callback: () => T): T {
  supressaoDeRecargaLocal += 1;
  try {
    return callback();
  } finally {
    supressaoDeRecargaLocal = Math.max(0, supressaoDeRecargaLocal - 1);
  }
}

function aplicarDeltaConta(contas: ContaBancaria[], contaId: string | undefined, delta: number) {
  if (!contaId || delta === 0) return contas;

  return contas.map((conta) => {
    if (conta.id !== contaId) return conta;
    const atualizada = {
      ...conta,
      saldo: arredondarMoeda(conta.saldo + delta),
      atualizado_em: new Date().toISOString(),
    };
    storageContas.save(atualizada);
    void syncSalvarConta(atualizada);
    return atualizada;
  });
}

function aplicarDeltaCartao(cartoes: CartaoCredito[], cartaoId: string | undefined, delta: number) {
  if (!cartaoId || delta === 0) return cartoes;

  return cartoes.map((cartao) => {
    if (cartao.id !== cartaoId) return cartao;
    const atualizado = {
      ...cartao,
      fatura_atual: arredondarMoeda(cartao.fatura_atual + delta),
      atualizado_em: new Date().toISOString(),
    };
    storageCartoes.save(atualizado);
    void syncSalvarCartao(atualizado);
    return atualizado;
  });
}

function aplicarImpactoFinanceiro(
  contas: ContaBancaria[],
  cartoes: CartaoCredito[],
  transacao: Pick<Transacao, 'tipo' | 'valor' | 'conta_id' | 'cartao_id' | 'data' | 'classificacao' | 'parcelas' | 'parcela_atual'>,
  direcao: 1 | -1,
) {
  let proximasContas = contas;
  let proximosCartoes = cartoes;
  const hoje = startOfTodayLocal();

  const ocorrenciasAteHoje = contarOcorrenciasAteData(transacao, hoje);
  if (ocorrenciasAteHoje <= 0) {
    return { contas: proximasContas, cartoes: proximosCartoes };
  }

  const valorAplicado = transacao.valor * ocorrenciasAteHoje;

  if (transacao.cartao_id && transacao.tipo === 'despesa') {
    proximosCartoes = aplicarDeltaCartao(proximosCartoes, transacao.cartao_id, valorAplicado * direcao);
    return { contas: proximasContas, cartoes: proximosCartoes };
  }

  if (!transacao.conta_id) {
    return { contas: proximasContas, cartoes: proximosCartoes };
  }

  if (transacao.tipo === 'receita') {
    proximasContas = aplicarDeltaConta(proximasContas, transacao.conta_id, valorAplicado * direcao);
  } else if (transacao.tipo === 'despesa') {
    proximasContas = aplicarDeltaConta(proximasContas, transacao.conta_id, -valorAplicado * direcao);
  } else if (transacao.tipo === 'transferencia') {
    proximasContas = aplicarDeltaConta(proximasContas, transacao.conta_id, -valorAplicado * direcao);
  }

  return { contas: proximasContas, cartoes: proximosCartoes };
}

function calcularImpactoContaAteData(transacao: Transacao, contaId: string, referencia: Date) {
  if (transacao.conta_id !== contaId) return 0;
  if (transacao.cartao_id && transacao.tipo === 'despesa') return 0;

  const sinal =
    transacao.tipo === 'receita'
      ? 1
      : transacao.tipo === 'despesa' || transacao.tipo === 'transferencia'
      ? -1
      : 0;

  if (sinal === 0) return 0;

  return contarOcorrenciasAteData(transacao, referencia) * transacao.valor * sinal;
}

function normalizarContasComTransacoes(contas: ContaBancaria[], transacoes: Transacao[]) {
  const hoje = startOfTodayLocal();

  return contas.map((conta) => {
    const saldoBase = conta.saldo_base ?? arredondarMoeda(
      conta.saldo - transacoes.reduce((soma, transacao) => (
        soma + calcularImpactoContaAteData(transacao, conta.id, hoje)
      ), 0),
    );
    const saldoEfetivo = arredondarMoeda(
      saldoBase + transacoes.reduce((soma, transacao) => soma + calcularImpactoContaAteData(transacao, conta.id, hoje), 0),
    );
    return {
      ...conta,
      saldo_base: saldoBase,
      saldo: saldoEfetivo,
    };
  });
}

function persistirContasNormalizadas(contas: ContaBancaria[], sync = false) {
  contas.forEach((conta) => {
    storageContas.save(conta);
    if (sync) {
      void syncSalvarConta(conta);
    }
  });
}

function calcularBaseFaturaCartao(
  cartao: Pick<CartaoCredito, 'id' | 'dia_fechamento' | 'dia_vencimento'>,
  transacoes: Transacao[],
  referencia = startOfTodayLocal(),
) {
  const ultimoMesConsiderado = new Date(referencia.getFullYear(), referencia.getMonth(), 1);

  return arredondarMoeda(transacoes.reduce((soma, transacao) => {
    if (transacao.cartao_id !== cartao.id) return soma;

    const primeiroMesDaTransacao = new Date(`${transacao.data}T00:00:00`);
    const cursor = new Date(primeiroMesDaTransacao.getFullYear(), primeiroMesDaTransacao.getMonth(), 1);
    let subtotal = 0;

    while (cursor <= ultimoMesConsiderado) {
      const ocorrencia = getDataOcorrenciaNoMes(transacao, cursor.getMonth() + 1, cursor.getFullYear());
      if (ocorrencia && ocorrencia <= referencia) {
        const dataOcorrencia = formatFinancialDate(ocorrencia);
        const dataCobranca = transacao.data_cobranca && dataOcorrencia === transacao.data
          ? transacao.data_cobranca
          : getDataCobrancaCartaoParaData(dataOcorrencia, cartao);

        if (!ocorrenciaEstaPaga(transacao, dataCobranca)) {
          subtotal += transacao.tipo === 'despesa' ? transacao.valor : -transacao.valor;
        }
      }

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return soma + subtotal;
  }, 0));
}

function normalizarCartoesComTransacoes(cartoes: CartaoCredito[], transacoes: Transacao[]) {
  const hoje = startOfTodayLocal();

  return cartoes.map((cartao) => {
    const baseFatura = calcularBaseFaturaCartao(cartao, transacoes, hoje);
    const ajusteManual = cartao.fatura_ajuste_manual ?? arredondarMoeda(cartao.fatura_atual - baseFatura);
    return {
      ...cartao,
      fatura_ajuste_manual: ajusteManual,
      fatura_atual: arredondarMoeda(baseFatura + ajusteManual),
    };
  });
}

function persistirCartoesNormalizados(cartoes: CartaoCredito[], sync = false) {
  cartoes.forEach((cartao) => {
    storageCartoes.save(cartao);
    if (sync) {
      void syncSalvarCartao(cartao);
    }
  });
}

function contarRegistrosRemotos(dados: Awaited<ReturnType<typeof baixarTudoDoSupabase>>) {
  return (
    dados.transacoes.length +
    dados.categorias.length +
    dados.contas.length +
    dados.cartoes.length +
    dados.investimentos.length +
    dados.metas.length +
    dados.orcamentos.length +
    dados.reservas.length +
    (dados.config ? 1 : 0)
  );
}

function contarRegistrosLocais(dados: {
  transacoes: Transacao[];
  categorias: Categoria[];
  contas: ContaBancaria[];
  cartoes: CartaoCredito[];
  investimentos: Investimento[];
  metas: Meta[];
  orcamentos: Orcamento[];
  reservas: ReturnType<typeof storageReservas.getAll>;
  config: ConfiguracaoApp;
}) {
  return (
    dados.transacoes.length +
    dados.categorias.length +
    dados.contas.length +
    dados.cartoes.length +
    dados.investimentos.length +
    dados.metas.length +
    dados.orcamentos.length +
    dados.reservas.length +
    1
  );
}

function getEstadoConfig(config: ConfiguracaoApp) {
  return {
    config,
    selicAtual: config.selic_atual ?? null,
    cdiAtual: config.cdi_atual ?? null,
    ipcaAtual: config.ipca_atual ?? null,
  };
}

export const useFinanceiroStore = create<FinanceiroState>((set, get) => {
  const carregarDoLocal = () => {
    executarSemRecargaLocal(() => {
      const config = storageConfig.get();
      const categorias = storageCategoriass.getAll();
      const contasOriginais = storageContas.getAll();
      const transacoes = normalizarTransacoesParaEstado(storageTransacoes.getAll(), categorias, contasOriginais, false);
      const contas = normalizarContasComTransacoes(contasOriginais, transacoes);
      const cartoes = normalizarCartoesComTransacoes(storageCartoes.getAll(), transacoes);
      persistirContasNormalizadas(contas);
      persistirCartoesNormalizados(cartoes);

      set({
        transacoes,
        categorias,
        investimentos: storageInvestimentos.getAll(),
        metas: storageMetas.getAll(),
        contas,
        cartoes,
        orcamentos: storageOrcamentos.getAll(),
        ...getEstadoConfig(config),
      });
    });
  };

  const aplicarDadosRemotos = (dados: Awaited<ReturnType<typeof baixarTudoDoSupabase>>) => {
    executarSemRecargaLocal(() => {
      const categoriasMescladas = mesclarRegistrosPorAtualizacao(dados.categorias, storageCategoriass.getAll());
      const contasMescladas = mesclarRegistrosPorAtualizacao(dados.contas, storageContas.getAll());
      const cartoesMesclados = mesclarRegistrosPorAtualizacao(dados.cartoes, storageCartoes.getAll());
      const investimentosMesclados = mesclarRegistrosPorAtualizacao(dados.investimentos, storageInvestimentos.getAll());
      const metasMescladas = mesclarRegistrosPorAtualizacao(dados.metas, storageMetas.getAll());
      const orcamentosMesclados = mesclarRegistrosPorAtualizacao(dados.orcamentos, storageOrcamentos.getAll());
      const reservasMescladas = mesclarRegistrosPorAtualizacao(dados.reservas, storageReservas.getAll());
      const transacoesMescladas = mesclarTransacoesPorAtualizacao(dados.transacoes, storageTransacoes.getAll());
      const transacoesNormalizadas = normalizarTransacoesParaEstado(transacoesMescladas, categoriasMescladas, contasMescladas, false);
      const contasNormalizadas = normalizarContasComTransacoes(contasMescladas, transacoesNormalizadas);
      const cartoesNormalizados = normalizarCartoesComTransacoes(cartoesMesclados, transacoesNormalizadas);
      storageTransacoes.replaceAll(transacoesNormalizadas);
      storageCategoriass.replaceAll(categoriasMescladas);
      storageContas.replaceAll(contasNormalizadas);
      storageCartoes.replaceAll(cartoesNormalizados);
      storageInvestimentos.replaceAll(investimentosMesclados);
      storageMetas.replaceAll(metasMescladas);
      storageOrcamentos.replaceAll(orcamentosMesclados);
      storageReservas.replaceAll(reservasMescladas);

      const configFinal = mesclarConfigPorAtualizacao(dados.config, storageConfig.get());
      storageConfig.replace(configFinal);

      set({
        transacoes: transacoesNormalizadas,
        categorias: categoriasMescladas,
        contas: contasNormalizadas,
        cartoes: cartoesNormalizados,
        investimentos: investimentosMesclados,
        metas: metasMescladas,
        orcamentos: orcamentosMesclados,
        ...getEstadoConfig(configFinal),
      });
    });
  };

  const sincronizarAutomaticamente = async () => {
    if (!isSupabaseConfigured()) return;
    if (syncEmAndamento) return syncEmAndamento;

    syncEmAndamento = (async () => {
      const filaInicial = await processarFilaDeSincronizacao();
      if (filaInicial.pendentes > 0) return;
      let dados = await baixarTudoDoSupabase();

      if (!contarRegistrosRemotos(dados)) {
        const estadoLocal = get();
        const totalLocal = contarRegistrosLocais({
          transacoes: estadoLocal.transacoes,
          categorias: estadoLocal.categorias,
          contas: estadoLocal.contas,
          cartoes: estadoLocal.cartoes,
          investimentos: estadoLocal.investimentos,
          metas: estadoLocal.metas,
          orcamentos: estadoLocal.orcamentos,
          reservas: storageReservas.getAll(),
          config: estadoLocal.config,
        });

        if (totalLocal > 1) {
          await enviarTudoParaSupabase({
            transacoes: estadoLocal.transacoes,
            categorias: estadoLocal.categorias,
            contas: estadoLocal.contas,
            cartoes: estadoLocal.cartoes,
            investimentos: estadoLocal.investimentos,
            metas: estadoLocal.metas,
            orcamentos: estadoLocal.orcamentos,
            reservas: storageReservas.getAll(),
            config: estadoLocal.config,
          });
          if (totalPendenciasDeSync() > 0) return;
          dados = await baixarTudoDoSupabase();
        }
      }

      if (!contarRegistrosRemotos(dados)) return;
      aplicarDadosRemotos(dados);
    })();

    try {
      await syncEmAndamento;
    } finally {
      syncEmAndamento = null;
    }
  };

  const registrarListenersDeSync = () => {
    if (listenersDeSyncRegistrados || typeof window === 'undefined') return;
    listenersDeSyncRegistrados = true;

    const sincronizarSilenciosamente = () => {
      void sincronizarAutomaticamente().catch(() => {
        // Mantem o app usando cache local se a nuvem falhar.
      });
    };

    const agendarSyncRemoto = (delay = 900) => {
      if (timeoutDeSyncRemoto) {
        clearTimeout(timeoutDeSyncRemoto);
      }

      timeoutDeSyncRemoto = window.setTimeout(() => {
        timeoutDeSyncRemoto = null;
        sincronizarSilenciosamente();
      }, delay);
    };

    const registrarCanalRealtime = () => {
      if (!isSupabaseConfigured() || canalRealtimeDeSync) return;

      const channel = supabase.channel(`financeiro-sync-${Date.now()}`);
      for (const table of SYNC_TABLES) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => agendarSyncRemoto(),
        );
      }

      canalRealtimeDeSync = channel;
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') return;
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;

        if (canalRealtimeDeSync === channel) {
          canalRealtimeDeSync = null;
        }

        void supabase.removeChannel(channel);

        if (document.visibilityState === 'visible') {
          window.setTimeout(() => {
            registrarCanalRealtime();
            agendarSyncRemoto(300);
          }, 4_000);
        }
      });
    };

    const recarregarDoLocal = () => {
      if (supressaoDeRecargaLocal > 0) return;
      carregarDoLocal();
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith('fin_')) return;
      recarregarDoLocal();
    };

    window.addEventListener('online', sincronizarSilenciosamente);
    window.addEventListener('focus', () => {
      registrarCanalRealtime();
      sincronizarSilenciosamente();
    });
    window.addEventListener('pageshow', () => {
      carregarDoLocal();
      registrarCanalRealtime();
      agendarSyncRemoto(150);
    });
    window.addEventListener('storage', handleStorage);
    window.addEventListener(FINANCEIRO_STORAGE_EVENT, recarregarDoLocal as EventListener);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        recarregarDoLocal();
        registrarCanalRealtime();
        sincronizarSilenciosamente();
      }
    });

    registrarCanalRealtime();

    if (intervaloDeSync) clearInterval(intervaloDeSync);
    intervaloDeSync = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      carregarDoLocal();
      registrarCanalRealtime();
      sincronizarSilenciosamente();
    }, 20_000);
  };

  return {
    transacoes: [],
    categorias: [],
    investimentos: [],
    metas: [],
    contas: [],
    cartoes: [],
    orcamentos: [],
    config: CONFIG_DEFAULT,
    dicasIA: [],
    autenticado: false,
    selicAtual: null,
    cdiAtual: null,
    ipcaAtual: null,

    autenticar: (pin) => {
      const cfg = storageConfig.get();
      const pinSalvo = cfg.pin || '1234';
      if (pin === pinSalvo) {
        set({ autenticado: true });
        return true;
      }
      return false;
    },

    desautenticar: () => set({ autenticado: false }),

    carregarDados: () => {
      carregarDoLocal();
      registrarListenersDeSync();

      void sincronizarAutomaticamente().catch(() => {
        // Se a sincronizacao falhar, o app segue com os dados locais.
      });
    },

    adicionarTransacao: (dados) => {
      return executarSemRecargaLocal(() => {
        const categorias = get().categorias;
        const contas = get().contas;
        const agora = new Date().toISOString();
        const nova = normalizarTransacaoRelacionamentos(
          { ...dados, id: gerarId(), criado_em: agora, atualizado_em: agora } as Transacao,
          categorias,
          contas,
        );
        storageTransacoes.save(nova);
        void syncSalvarTransacao(nova);

        set((s) => {
          const proximasTransacoes = [nova, ...s.transacoes];
          const impacto = aplicarImpactoFinanceiro(s.contas, s.cartoes, nova, 1);
          const contasNormalizadas = normalizarContasComTransacoes(impacto.contas, proximasTransacoes);
          const cartoesNormalizados = normalizarCartoesComTransacoes(impacto.cartoes, proximasTransacoes);
          persistirContasNormalizadas(contasNormalizadas, true);
          persistirCartoesNormalizados(cartoesNormalizados, true);

          return { transacoes: proximasTransacoes, contas: contasNormalizadas, cartoes: cartoesNormalizados };
        });

        return nova;
      });
    },

    editarTransacao: (id, dados) => {
      executarSemRecargaLocal(() => {
        const atual = get().transacoes.find((t) => t.id === id);
        if (!atual) return;

        const atualizada = normalizarTransacaoRelacionamentos(
          { ...atual, ...dados, atualizado_em: new Date().toISOString() },
          get().categorias,
          get().contas,
        );
        storageTransacoes.save(atualizada);
        void syncSalvarTransacao(atualizada);

        set((s) => {
          const proximasTransacoes = s.transacoes.map((t) => (t.id === id ? atualizada : t));
          const revertido = aplicarImpactoFinanceiro(s.contas, s.cartoes, atual, -1);
          const reaplicado = aplicarImpactoFinanceiro(revertido.contas, revertido.cartoes, atualizada, 1);
          const contasNormalizadas = normalizarContasComTransacoes(reaplicado.contas, proximasTransacoes);
          const cartoesNormalizados = normalizarCartoesComTransacoes(reaplicado.cartoes, proximasTransacoes);
          persistirContasNormalizadas(contasNormalizadas, true);
          persistirCartoesNormalizados(cartoesNormalizados, true);
          return {
            transacoes: proximasTransacoes,
            contas: contasNormalizadas,
            cartoes: cartoesNormalizados,
          };
        });
      });
    },

    excluirTransacao: (id) => {
      executarSemRecargaLocal(() => {
        const atual = get().transacoes.find((t) => t.id === id);
        if (!atual) return;

        storageTransacoes.delete(id);
        void syncExcluirTransacao(id);
        set((s) => {
          const proximasTransacoes = s.transacoes.filter((t) => t.id !== id);
          const revertido = aplicarImpactoFinanceiro(s.contas, s.cartoes, atual, -1);
          const contasNormalizadas = normalizarContasComTransacoes(revertido.contas, proximasTransacoes);
          const cartoesNormalizados = normalizarCartoesComTransacoes(revertido.cartoes, proximasTransacoes);
          persistirContasNormalizadas(contasNormalizadas, true);
          persistirCartoesNormalizados(cartoesNormalizados, true);
          return {
            transacoes: proximasTransacoes,
            contas: contasNormalizadas,
            cartoes: cartoesNormalizados,
          };
        });
      });
    },

    marcarTransacaoComoPaga: (id, dataOcorrencia) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const lista = get().transacoes.map((transacao) => {
          if (transacao.id !== id) return transacao;
          const atualizada = {
            ...transacao,
            datas_pagamento: registrarPagamentoOcorrencia(transacao, dataOcorrencia),
            atualizado_em: agora,
          };
          storageTransacoes.save(atualizada);
          void syncSalvarTransacao(atualizada);
          return atualizada;
        });
        set({ transacoes: lista });
      });
    },

    desmarcarTransacaoComoPaga: (id, dataOcorrencia) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const lista = get().transacoes.map((transacao) => {
          if (transacao.id !== id) return transacao;
          const atualizada = {
            ...transacao,
            datas_pagamento: removerPagamentoOcorrencia(transacao, dataOcorrencia),
            atualizado_em: agora,
          };
          storageTransacoes.save(atualizada);
          void syncSalvarTransacao(atualizada);
          return atualizada;
        });
        set({ transacoes: lista });
      });
    },

    marcarFaturaCartaoComoPaga: (cartaoId, pagamentos) => {
      executarSemRecargaLocal(() => {
        if (pagamentos.length === 0) return;

        const agora = new Date().toISOString();
        const pagamentosPorTransacao = new Map<string, string[]>();
        pagamentos.forEach(({ transacaoId, dataOcorrencia }) => {
          const datas = pagamentosPorTransacao.get(transacaoId) || [];
          datas.push(dataOcorrencia);
          pagamentosPorTransacao.set(transacaoId, datas);
        });

        const transacoesAtualizadas = get().transacoes.map((transacao) => {
          const datas = pagamentosPorTransacao.get(transacao.id);
          if (!datas?.length) return transacao;

          const atualizada = {
            ...transacao,
            datas_pagamento: datas.reduce(
              (acumulado, dataOcorrencia) => registrarPagamentoOcorrencia({ datas_pagamento: acumulado }, dataOcorrencia),
              transacao.datas_pagamento || [],
            ),
            atualizado_em: agora,
          };
          storageTransacoes.save(atualizada);
          void syncSalvarTransacao(atualizada);
          return atualizada;
        });

        const referenciaPagamento = pagamentos
          .map((item) => item.dataOcorrencia)
          .sort()
          .at(-1);

        const cartoesAtualizados = get().cartoes.map((cartao) => {
          if (cartao.id !== cartaoId) return cartao;
          const atualizado = {
            ...cartao,
            ultima_fatura_paga_em: agora,
            ultima_fatura_paga_referencia: referenciaPagamento,
            atualizado_em: agora,
          };
          storageCartoes.save(atualizado);
          void syncSalvarCartao(atualizado);
          return atualizado;
        });

        const cartoesNormalizados = normalizarCartoesComTransacoes(cartoesAtualizados, transacoesAtualizadas);
        persistirCartoesNormalizados(cartoesNormalizados, true);

        set({
          transacoes: transacoesAtualizadas,
          cartoes: cartoesNormalizados,
        });
      });
    },

    adicionarCategoria: (dados) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const nova: Categoria = { ...dados, id: gerarId(), criado_em: agora, atualizado_em: agora };
        storageCategoriass.save(nova);
        void syncSalvarCategoria(nova);
        set((s) => ({ categorias: [...s.categorias, nova] }));
      });
    },

    atualizarSaldoConta: (id, saldo) => {
      executarSemRecargaLocal(() => {
        const hoje = startOfTodayLocal();
        const transacoes = get().transacoes;
        const agora = new Date().toISOString();
        const lista = get().contas.map((c) => {
          if (c.id !== id) return c;
          const impactoAtual = transacoes.reduce((soma, transacao) => (
            soma + calcularImpactoContaAteData(transacao, id, hoje)
          ), 0);
          return { ...c, saldo, saldo_base: arredondarMoeda(saldo - impactoAtual), atualizado_em: agora };
        });
        const conta = lista.find((c) => c.id === id);
        if (conta) {
          storageContas.save(conta);
          void syncSalvarConta(conta);
        }
        set({ contas: lista });
      });
    },

    adicionarConta: (dados) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const nova: ContaBancaria = {
          ...dados,
          saldo_base: dados.saldo,
          id: gerarId(),
          criado_em: agora,
          atualizado_em: agora,
        };
        storageContas.save(nova);
        void syncSalvarConta(nova);
        set((s) => ({ contas: [...s.contas, nova] }));
      });
    },

    excluirConta: (id) => {
      executarSemRecargaLocal(() => {
        storageContas.delete(id);
        void syncExcluirConta(id);
        set((s) => ({ contas: s.contas.filter((c) => c.id !== id) }));
      });
    },

    atualizarFaturaCartao: (id, fatura) => {
      executarSemRecargaLocal(() => {
        const cartaoAtual = get().cartoes.find((item) => item.id === id);
        const baseFatura = cartaoAtual ? calcularBaseFaturaCartao(cartaoAtual, get().transacoes) : 0;
        const agora = new Date().toISOString();
        const lista = get().cartoes.map((c) => (
          c.id === id
            ? {
                ...c,
                fatura_ajuste_manual: arredondarMoeda(fatura - baseFatura),
                fatura_atual: arredondarMoeda(fatura),
                atualizado_em: agora,
              }
            : c
        ));
        const cartao = lista.find((c) => c.id === id);
        if (cartao) {
          storageCartoes.save(cartao);
          void syncSalvarCartao(cartao);
        }
        set({ cartoes: lista });
      });
    },

    adicionarCartao: (dados) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const novo: CartaoCredito = {
          ...dados,
          fatura_ajuste_manual: dados.fatura_atual,
          id: gerarId(),
          criado_em: agora,
          atualizado_em: agora,
        };
        storageCartoes.save(novo);
        void syncSalvarCartao(novo);
        set((s) => ({ cartoes: [...s.cartoes, novo] }));
      });
    },

    editarCartao: (id, dados) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const lista = get().cartoes.map((cartao) => {
          if (cartao.id !== id) return cartao;
          const proximoCartao = {
            ...cartao,
            ...dados,
            id: cartao.id,
            criado_em: cartao.criado_em,
            atualizado_em: agora,
          };
          const baseFatura = calcularBaseFaturaCartao(proximoCartao, get().transacoes);
          const faturaDesejada = typeof dados.fatura_atual === 'number' ? dados.fatura_atual : cartao.fatura_atual;
          return {
            ...proximoCartao,
            fatura_ajuste_manual: arredondarMoeda(faturaDesejada - baseFatura),
            fatura_atual: arredondarMoeda(faturaDesejada),
          };
        });
        const cartao = lista.find((item) => item.id === id);
        if (cartao) {
          storageCartoes.save(cartao);
          void syncSalvarCartao(cartao);
        }
        set({ cartoes: lista });
      });
    },

    excluirCartao: (id) => {
      executarSemRecargaLocal(() => {
        storageCartoes.delete(id);
        void syncExcluirCartao(id);
        set((s) => ({ cartoes: s.cartoes.filter((c) => c.id !== id) }));
      });
    },

    adicionarInvestimento: (dados) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const novo: Investimento = { ...dados, id: gerarId(), criado_em: agora, atualizado_em: agora };
        storageInvestimentos.save(novo);
        void syncSalvarInvestimento(novo);
        set((s) => ({ investimentos: [novo, ...s.investimentos] }));
      });
    },

    excluirInvestimento: (id) => {
      executarSemRecargaLocal(() => {
        storageInvestimentos.delete(id);
        void syncExcluirInvestimento(id);
        set((s) => ({ investimentos: s.investimentos.filter((i) => i.id !== id) }));
      });
    },

    adicionarMeta: (dados) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const nova: Meta = { ...dados, id: gerarId(), criado_em: agora, atualizado_em: agora };
        storageMetas.save(nova);
        void syncSalvarMeta(nova);
        set((s) => ({ metas: [nova, ...s.metas] }));
      });
    },

    atualizarMeta: (id, valor_atual) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const lista = get().metas.map((m) => (m.id === id ? { ...m, valor_atual, atualizado_em: agora } : m));
        const meta = lista.find((m) => m.id === id);
        if (meta) {
          storageMetas.save(meta);
          void syncSalvarMeta(meta);
        }
        set({ metas: lista });
      });
    },

    excluirMeta: (id) => {
      executarSemRecargaLocal(() => {
        storageMetas.delete(id);
        void syncExcluirMeta(id);
        set((s) => ({ metas: s.metas.filter((m) => m.id !== id) }));
      });
    },

    adicionarOrcamento: (dados) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const novo: Orcamento = { ...dados, id: gerarId(), criado_em: agora, atualizado_em: agora };
        storageOrcamentos.save(novo);
        void syncSalvarOrcamento(novo);
        set((s) => ({ orcamentos: [...s.orcamentos, novo] }));
      });
    },

    editarOrcamento: (id, dados) => {
      executarSemRecargaLocal(() => {
        const agora = new Date().toISOString();
        const lista = get().orcamentos.map((o) => (o.id === id ? { ...o, ...dados, atualizado_em: agora } : o));
        const item = lista.find((o) => o.id === id);
        if (item) {
          storageOrcamentos.save(item);
          void syncSalvarOrcamento(item);
        }
        set({ orcamentos: lista });
      });
    },

    excluirOrcamento: (id) => {
      executarSemRecargaLocal(() => {
        storageOrcamentos.delete(id);
        void syncExcluirOrcamento(id);
        set((s) => ({ orcamentos: s.orcamentos.filter((o) => o.id !== id) }));
      });
    },

    atualizarConfig: (dados) => {
      executarSemRecargaLocal(() => {
        const configAtualizada = { ...get().config, ...dados, atualizado_em: new Date().toISOString() };
        storageConfig.replace(configAtualizada);
        void syncSalvarConfig(configAtualizada);
        set({
          ...getEstadoConfig(configAtualizada),
        });
      });
    },

    setTaxas: (selic, cdi, ipca) => set({ selicAtual: selic, cdiAtual: cdi, ipcaAtual: ipca }),

    setDicasIA: (dicasIA) => set({ dicasIA }),

    sincronizarDoSupabase: async () => {
      try {
        const fila = await processarFilaDeSincronizacao();
        if (fila.pendentes > 0) {
          return { ok: false, msg: `Ainda existem ${fila.pendentes} alteracoes locais pendentes. Use "Enviar pra nuvem" com internet ativa antes de baixar.` };
        }
        const dados = await baixarTudoDoSupabase();
        const total = contarRegistrosRemotos(dados);

        if (!total) {
          return { ok: false, msg: 'Nenhum dado encontrado na nuvem.' };
        }

        aplicarDadosRemotos(dados);
        return { ok: true, msg: `${total} registros sincronizados da nuvem!` };
      } catch {
        return { ok: false, msg: 'Erro ao conectar com a nuvem.' };
      }
    },

    enviarParaNuvem: async () => {
      try {
        const s = get();
        await enviarTudoParaSupabase({
          transacoes: s.transacoes,
          categorias: s.categorias,
          contas: s.contas,
          cartoes: s.cartoes,
          investimentos: s.investimentos,
          metas: s.metas,
          orcamentos: s.orcamentos,
          reservas: storageReservas.getAll(),
          config: s.config,
        });
        const pendencias = totalPendenciasDeSync();
        if (pendencias > 0) {
          return { ok: false, msg: `${pendencias} alteracoes ainda nao conseguiram subir para a nuvem. Mantenha o app online e tente novamente.` };
        }

        const dados = await baixarTudoDoSupabase();
        if (contarRegistrosRemotos(dados)) {
          aplicarDadosRemotos(dados);
        }

        const total =
          s.transacoes.length +
          s.categorias.length +
          s.contas.length +
          s.cartoes.length +
          s.investimentos.length +
          s.metas.length +
          s.orcamentos.length +
          storageReservas.getAll().length +
          1;

        return { ok: true, msg: `${total} registros enviados para a nuvem!` };
      } catch {
        return { ok: false, msg: 'Erro ao enviar para a nuvem.' };
      }
    },
  };
});
