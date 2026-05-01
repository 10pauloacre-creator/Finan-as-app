import { create } from 'zustand';
import {
  Transacao, Categoria, Investimento, Meta, ConfiguracaoApp,
  DicaIA, ContaBancaria, CartaoCredito, Orcamento,
} from '@/types';
import {
  storageTransacoes, storageCategoriass, storageInvestimentos,
  storageMetas, storageConfig, storageContas, storageCartoes, storageOrcamentos, gerarId,
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
  baixarTudoDoSupabase, enviarTudoParaSupabase, processarFilaDeSincronizacao,
} from '@/lib/sync';
import { isSupabaseConfigured } from '@/lib/supabase';

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

  adicionarCategoria: (c: Omit<Categoria, 'id' | 'criado_em'>) => void;

  atualizarSaldoConta: (id: string, saldo: number) => void;
  adicionarConta: (c: Omit<ContaBancaria, 'id' | 'criado_em'>) => void;
  excluirConta: (id: string) => void;

  atualizarFaturaCartao: (id: string, fatura: number) => void;
  adicionarCartao: (c: Omit<CartaoCredito, 'id' | 'criado_em'>) => void;
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

const CONFIG_DEFAULT: ConfiguracaoApp = { tema: 'escuro', moeda: 'BRL', notificacoes_ativas: true };

let listenersDeSyncRegistrados = false;
let syncEmAndamento: Promise<void> | null = null;

function arredondarMoeda(valor: number) {
  return Number(valor.toFixed(2));
}

function aplicarDeltaConta(contas: ContaBancaria[], contaId: string | undefined, delta: number) {
  if (!contaId || delta === 0) return contas;

  return contas.map((conta) => {
    if (conta.id !== contaId) return conta;
    const atualizada = { ...conta, saldo: arredondarMoeda(conta.saldo + delta) };
    storageContas.save(atualizada);
    void syncSalvarConta(atualizada);
    return atualizada;
  });
}

function aplicarDeltaCartao(cartoes: CartaoCredito[], cartaoId: string | undefined, delta: number) {
  if (!cartaoId || delta === 0) return cartoes;

  return cartoes.map((cartao) => {
    if (cartao.id !== cartaoId) return cartao;
    const atualizado = { ...cartao, fatura_atual: arredondarMoeda(cartao.fatura_atual + delta) };
    storageCartoes.save(atualizado);
    void syncSalvarCartao(atualizado);
    return atualizado;
  });
}

function aplicarImpactoFinanceiro(
  contas: ContaBancaria[],
  cartoes: CartaoCredito[],
  transacao: Pick<Transacao, 'tipo' | 'valor' | 'conta_id' | 'cartao_id'>,
  direcao: 1 | -1,
) {
  let proximasContas = contas;
  let proximosCartoes = cartoes;

  if (transacao.cartao_id && transacao.tipo === 'despesa') {
    proximosCartoes = aplicarDeltaCartao(proximosCartoes, transacao.cartao_id, transacao.valor * direcao);
    return { contas: proximasContas, cartoes: proximosCartoes };
  }

  if (!transacao.conta_id) {
    return { contas: proximasContas, cartoes: proximosCartoes };
  }

  if (transacao.tipo === 'receita') {
    proximasContas = aplicarDeltaConta(proximasContas, transacao.conta_id, transacao.valor * direcao);
  } else if (transacao.tipo === 'despesa') {
    proximasContas = aplicarDeltaConta(proximasContas, transacao.conta_id, -transacao.valor * direcao);
  } else if (transacao.tipo === 'transferencia') {
    proximasContas = aplicarDeltaConta(proximasContas, transacao.conta_id, -transacao.valor * direcao);
  }

  return { contas: proximasContas, cartoes: proximosCartoes };
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
    const config = storageConfig.get();

    set({
      transacoes: storageTransacoes.getAll(),
      categorias: storageCategoriass.getAll(),
      investimentos: storageInvestimentos.getAll(),
      metas: storageMetas.getAll(),
      contas: storageContas.getAll(),
      cartoes: storageCartoes.getAll(),
      orcamentos: storageOrcamentos.getAll(),
      ...getEstadoConfig(config),
    });
  };

  const aplicarDadosRemotos = (dados: Awaited<ReturnType<typeof baixarTudoDoSupabase>>) => {
    storageTransacoes.replaceAll(dados.transacoes);
    storageCategoriass.replaceAll(dados.categorias);
    storageContas.replaceAll(dados.contas);
    storageCartoes.replaceAll(dados.cartoes);
    storageInvestimentos.replaceAll(dados.investimentos);
    storageMetas.replaceAll(dados.metas);
    storageOrcamentos.replaceAll(dados.orcamentos);

    const configFinal = dados.config ?? storageConfig.get();
    if (dados.config) storageConfig.replace(dados.config);

    set({
      transacoes: dados.transacoes,
      categorias: dados.categorias,
      contas: dados.contas,
      cartoes: dados.cartoes,
      investimentos: dados.investimentos,
      metas: dados.metas,
      orcamentos: dados.orcamentos,
      ...getEstadoConfig(configFinal),
    });
  };

  const sincronizarAutomaticamente = async () => {
    if (!isSupabaseConfigured()) return;
    if (syncEmAndamento) return syncEmAndamento;

    syncEmAndamento = (async () => {
      await processarFilaDeSincronizacao();
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
            config: estadoLocal.config,
          });
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

    window.addEventListener('online', sincronizarSilenciosamente);
    window.addEventListener('focus', sincronizarSilenciosamente);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sincronizarSilenciosamente();
    });
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
      const nova: Transacao = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
      storageTransacoes.save(nova);
      void syncSalvarTransacao(nova);

      set((s) => {
        const impacto = aplicarImpactoFinanceiro(s.contas, s.cartoes, nova, 1);

        return { transacoes: [nova, ...s.transacoes], contas: impacto.contas, cartoes: impacto.cartoes };
      });

      return nova;
    },

    editarTransacao: (id, dados) => {
      const atual = get().transacoes.find((t) => t.id === id);
      if (!atual) return;

      const atualizada = { ...atual, ...dados };
      storageTransacoes.save(atualizada);
      void syncSalvarTransacao(atualizada);

      set((s) => {
        const revertido = aplicarImpactoFinanceiro(s.contas, s.cartoes, atual, -1);
        const reaplicado = aplicarImpactoFinanceiro(revertido.contas, revertido.cartoes, atualizada, 1);
        return {
          transacoes: s.transacoes.map((t) => (t.id === id ? atualizada : t)),
          contas: reaplicado.contas,
          cartoes: reaplicado.cartoes,
        };
      });
    },

    excluirTransacao: (id) => {
      const atual = get().transacoes.find((t) => t.id === id);
      if (!atual) return;

      storageTransacoes.delete(id);
      void syncExcluirTransacao(id);
      set((s) => {
        const revertido = aplicarImpactoFinanceiro(s.contas, s.cartoes, atual, -1);
        return {
          transacoes: s.transacoes.filter((t) => t.id !== id),
          contas: revertido.contas,
          cartoes: revertido.cartoes,
        };
      });
    },

    adicionarCategoria: (dados) => {
      const nova: Categoria = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
      storageCategoriass.save(nova);
      void syncSalvarCategoria(nova);
      set((s) => ({ categorias: [...s.categorias, nova] }));
    },

    atualizarSaldoConta: (id, saldo) => {
      const lista = get().contas.map((c) => (c.id === id ? { ...c, saldo } : c));
      const conta = lista.find((c) => c.id === id);
      if (conta) {
        storageContas.save(conta);
        void syncSalvarConta(conta);
      }
      set({ contas: lista });
    },

    adicionarConta: (dados) => {
      const nova: ContaBancaria = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
      storageContas.save(nova);
      void syncSalvarConta(nova);
      set((s) => ({ contas: [...s.contas, nova] }));
    },

    excluirConta: (id) => {
      storageContas.delete(id);
      void syncExcluirConta(id);
      set((s) => ({ contas: s.contas.filter((c) => c.id !== id) }));
    },

    atualizarFaturaCartao: (id, fatura) => {
      const lista = get().cartoes.map((c) => (c.id === id ? { ...c, fatura_atual: fatura } : c));
      const cartao = lista.find((c) => c.id === id);
      if (cartao) {
        storageCartoes.save(cartao);
        void syncSalvarCartao(cartao);
      }
      set({ cartoes: lista });
    },

    adicionarCartao: (dados) => {
      const novo: CartaoCredito = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
      storageCartoes.save(novo);
      void syncSalvarCartao(novo);
      set((s) => ({ cartoes: [...s.cartoes, novo] }));
    },

    excluirCartao: (id) => {
      storageCartoes.delete(id);
      void syncExcluirCartao(id);
      set((s) => ({ cartoes: s.cartoes.filter((c) => c.id !== id) }));
    },

    adicionarInvestimento: (dados) => {
      const novo: Investimento = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
      storageInvestimentos.save(novo);
      void syncSalvarInvestimento(novo);
      set((s) => ({ investimentos: [novo, ...s.investimentos] }));
    },

    excluirInvestimento: (id) => {
      storageInvestimentos.delete(id);
      void syncExcluirInvestimento(id);
      set((s) => ({ investimentos: s.investimentos.filter((i) => i.id !== id) }));
    },

    adicionarMeta: (dados) => {
      const nova: Meta = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
      storageMetas.save(nova);
      void syncSalvarMeta(nova);
      set((s) => ({ metas: [nova, ...s.metas] }));
    },

    atualizarMeta: (id, valor_atual) => {
      const lista = get().metas.map((m) => (m.id === id ? { ...m, valor_atual } : m));
      const meta = lista.find((m) => m.id === id);
      if (meta) {
        storageMetas.save(meta);
        void syncSalvarMeta(meta);
      }
      set({ metas: lista });
    },

    excluirMeta: (id) => {
      storageMetas.delete(id);
      void syncExcluirMeta(id);
      set((s) => ({ metas: s.metas.filter((m) => m.id !== id) }));
    },

    adicionarOrcamento: (dados) => {
      const novo: Orcamento = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
      storageOrcamentos.save(novo);
      void syncSalvarOrcamento(novo);
      set((s) => ({ orcamentos: [...s.orcamentos, novo] }));
    },

    editarOrcamento: (id, dados) => {
      const lista = get().orcamentos.map((o) => (o.id === id ? { ...o, ...dados } : o));
      const item = lista.find((o) => o.id === id);
      if (item) {
        storageOrcamentos.save(item);
        void syncSalvarOrcamento(item);
      }
      set({ orcamentos: lista });
    },

    excluirOrcamento: (id) => {
      storageOrcamentos.delete(id);
      void syncExcluirOrcamento(id);
      set((s) => ({ orcamentos: s.orcamentos.filter((o) => o.id !== id) }));
    },

    atualizarConfig: (dados) => {
      const configAtualizada = { ...get().config, ...dados };
      storageConfig.set(dados);
      void syncSalvarConfig(configAtualizada);
      set({
        ...getEstadoConfig(configAtualizada),
      });
    },

    setTaxas: (selic, cdi, ipca) => set({ selicAtual: selic, cdiAtual: cdi, ipcaAtual: ipca }),

    setDicasIA: (dicasIA) => set({ dicasIA }),

    sincronizarDoSupabase: async () => {
      try {
        await processarFilaDeSincronizacao();
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
          config: s.config,
        });

        const total =
          s.transacoes.length +
          s.categorias.length +
          s.contas.length +
          s.cartoes.length +
          s.investimentos.length +
          s.metas.length +
          s.orcamentos.length +
          1;

        return { ok: true, msg: `${total} registros enviados para a nuvem!` };
      } catch {
        return { ok: false, msg: 'Erro ao enviar para a nuvem.' };
      }
    },
  };
});
