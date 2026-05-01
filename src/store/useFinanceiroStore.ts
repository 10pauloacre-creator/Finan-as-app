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
      const dados = await baixarTudoDoSupabase();
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
        let cartoes = s.cartoes;

        if (nova.cartao_id && nova.tipo === 'despesa') {
          cartoes = s.cartoes.map((c) => {
            if (c.id !== nova.cartao_id) return c;
            const updated = { ...c, fatura_atual: +(c.fatura_atual + nova.valor).toFixed(2) };
            storageCartoes.save(updated);
            void syncSalvarCartao(updated);
            return updated;
          });
        }

        return { transacoes: [nova, ...s.transacoes], cartoes };
      });

      return nova;
    },

    editarTransacao: (id, dados) => {
      const lista = get().transacoes.map((t) => (t.id === id ? { ...t, ...dados } : t));
      const transacao = lista.find((t) => t.id === id);
      if (transacao) {
        storageTransacoes.save(transacao);
        void syncSalvarTransacao(transacao);
      }
      set({ transacoes: lista });
    },

    excluirTransacao: (id) => {
      storageTransacoes.delete(id);
      void syncExcluirTransacao(id);
      set((s) => ({ transacoes: s.transacoes.filter((t) => t.id !== id) }));
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
