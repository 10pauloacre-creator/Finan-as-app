import { create } from 'zustand';
import {
  Transacao, Categoria, Investimento, Meta, ConfiguracaoApp,
  DicaIA, ContaBancaria, CartaoCredito, Orcamento
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
  baixarTudoDoSupabase, enviarTudoParaSupabase,
} from '@/lib/sync';

interface FinanceiroState {
  transacoes:    Transacao[];
  categorias:    Categoria[];
  investimentos: Investimento[];
  metas:         Meta[];
  contas:        ContaBancaria[];
  cartoes:       CartaoCredito[];
  orcamentos:    Orcamento[];
  config:        ConfiguracaoApp;
  dicasIA:       DicaIA[];
  autenticado:   boolean;
  selicAtual:    number | null;
  cdiAtual:      number | null;
  ipcaAtual:     number | null;

  // Auth
  autenticar:      (pin: string) => boolean;
  desautenticar:   () => void;
  carregarDados:   () => void;

  // Transações
  adicionarTransacao: (t: Omit<Transacao, 'id' | 'criado_em'>) => Transacao;
  editarTransacao:    (id: string, dados: Partial<Transacao>) => void;
  excluirTransacao:   (id: string) => void;

  // Categorias
  adicionarCategoria: (c: Omit<Categoria, 'id' | 'criado_em'>) => void;

  // Contas bancárias
  atualizarSaldoConta: (id: string, saldo: number) => void;
  adicionarConta:      (c: Omit<ContaBancaria, 'id' | 'criado_em'>) => void;
  excluirConta:        (id: string) => void;

  // Cartões
  atualizarFaturaCartao: (id: string, fatura: number) => void;
  adicionarCartao:       (c: Omit<CartaoCredito, 'id' | 'criado_em'>) => void;
  excluirCartao:         (id: string) => void;

  // Investimentos
  adicionarInvestimento: (inv: Omit<Investimento, 'id' | 'criado_em'>) => void;
  excluirInvestimento:   (id: string) => void;

  // Metas
  adicionarMeta:  (m: Omit<Meta, 'id' | 'criado_em'>) => void;
  atualizarMeta:  (id: string, valor_atual: number) => void;
  excluirMeta:    (id: string) => void;

  // Orçamentos
  adicionarOrcamento: (o: Omit<Orcamento, 'id' | 'criado_em'>) => void;
  editarOrcamento:    (id: string, dados: Partial<Orcamento>) => void;
  excluirOrcamento:   (id: string) => void;

  // Config / IA
  atualizarConfig: (c: Partial<ConfiguracaoApp>) => void;
  setTaxas:        (selic: number, cdi: number, ipca: number) => void;
  setDicasIA:      (dicas: DicaIA[]) => void;

  // Supabase sync
  sincronizarDoSupabase: () => Promise<{ ok: boolean; msg: string }>;
  enviarParaNuvem:       () => Promise<{ ok: boolean; msg: string }>;
}

const CONFIG_DEFAULT: ConfiguracaoApp = { tema: 'escuro', moeda: 'BRL', notificacoes_ativas: true };

export const useFinanceiroStore = create<FinanceiroState>((set, get) => ({
  transacoes: [], categorias: [], investimentos: [], metas: [],
  contas: [], cartoes: [], orcamentos: [], config: CONFIG_DEFAULT, dicasIA: [],
  autenticado: false, selicAtual: null, cdiAtual: null, ipcaAtual: null,

  autenticar: (pin) => {
    const cfg = storageConfig.get();
    const pinSalvo = cfg.pin || '1234';
    if (pin === pinSalvo) { set({ autenticado: true }); return true; }
    return false;
  },
  desautenticar: () => set({ autenticado: false }),

  carregarDados: () => {
    set({
      transacoes:    storageTransacoes.getAll(),
      categorias:    storageCategoriass.getAll(),
      investimentos: storageInvestimentos.getAll(),
      metas:         storageMetas.getAll(),
      contas:        storageContas.getAll(),
      cartoes:       storageCartoes.getAll(),
      orcamentos:    storageOrcamentos.getAll(),
      config:        storageConfig.get(),
    });
  },

  // ── Transações ──────────────────────────────────────
  adicionarTransacao: (dados) => {
    const nova: Transacao = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
    storageTransacoes.save(nova);
    syncSalvarTransacao(nova);
    set(s => {
      let cartoes = s.cartoes;
      if (nova.cartao_id && nova.tipo === 'despesa') {
        cartoes = s.cartoes.map(c => {
          if (c.id !== nova.cartao_id) return c;
          const updated = { ...c, fatura_atual: +(c.fatura_atual + nova.valor).toFixed(2) };
          storageCartoes.save(updated);
          syncSalvarCartao(updated);
          return updated;
        });
      }
      return { transacoes: [nova, ...s.transacoes], cartoes };
    });
    return nova;
  },
  editarTransacao: (id, dados) => {
    const lista = get().transacoes.map(t => t.id === id ? { ...t, ...dados } : t);
    lista.forEach(t => { if (t.id === id) { storageTransacoes.save(t); syncSalvarTransacao(t); } });
    set({ transacoes: lista });
  },
  excluirTransacao: (id) => {
    storageTransacoes.delete(id);
    syncExcluirTransacao(id);
    set(s => ({ transacoes: s.transacoes.filter(t => t.id !== id) }));
  },

  // ── Categorias ──────────────────────────────────────
  adicionarCategoria: (dados) => {
    const nova: Categoria = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
    storageCategoriass.save(nova);
    syncSalvarCategoria(nova);
    set(s => ({ categorias: [...s.categorias, nova] }));
  },

  // ── Contas ──────────────────────────────────────────
  atualizarSaldoConta: (id, saldo) => {
    const lista = get().contas.map(c => c.id === id ? { ...c, saldo } : c);
    const conta = lista.find(c => c.id === id);
    if (conta) { storageContas.save(conta); syncSalvarConta(conta); }
    set({ contas: lista });
  },
  adicionarConta: (dados) => {
    const nova: ContaBancaria = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
    storageContas.save(nova);
    syncSalvarConta(nova);
    set(s => ({ contas: [...s.contas, nova] }));
  },
  excluirConta: (id) => {
    storageContas.delete(id);
    syncExcluirConta(id);
    set(s => ({ contas: s.contas.filter(c => c.id !== id) }));
  },

  // ── Cartões ─────────────────────────────────────────
  atualizarFaturaCartao: (id, fatura) => {
    const lista = get().cartoes.map(c => c.id === id ? { ...c, fatura_atual: fatura } : c);
    const cartao = lista.find(c => c.id === id);
    if (cartao) { storageCartoes.save(cartao); syncSalvarCartao(cartao); }
    set({ cartoes: lista });
  },
  adicionarCartao: (dados) => {
    const novo: CartaoCredito = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
    storageCartoes.save(novo);
    syncSalvarCartao(novo);
    set(s => ({ cartoes: [...s.cartoes, novo] }));
  },
  excluirCartao: (id) => {
    storageCartoes.delete(id);
    syncExcluirCartao(id);
    set(s => ({ cartoes: s.cartoes.filter(c => c.id !== id) }));
  },

  // ── Investimentos ───────────────────────────────────
  adicionarInvestimento: (dados) => {
    const novo: Investimento = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
    storageInvestimentos.save(novo);
    syncSalvarInvestimento(novo);
    set(s => ({ investimentos: [novo, ...s.investimentos] }));
  },
  excluirInvestimento: (id) => {
    storageInvestimentos.delete(id);
    syncExcluirInvestimento(id);
    set(s => ({ investimentos: s.investimentos.filter(i => i.id !== id) }));
  },

  // ── Metas ───────────────────────────────────────────
  adicionarMeta: (dados) => {
    const nova: Meta = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
    storageMetas.save(nova);
    set(s => ({ metas: [nova, ...s.metas] }));
  },
  atualizarMeta: (id, valor_atual) => {
    const lista = get().metas.map(m => m.id === id ? { ...m, valor_atual } : m);
    const meta = lista.find(m => m.id === id);
    if (meta) storageMetas.save(meta);
    set({ metas: lista });
  },
  excluirMeta: (id) => {
    storageMetas.delete(id);
    set(s => ({ metas: s.metas.filter(m => m.id !== id) }));
  },

  // ── Orçamentos ──────────────────────────────────────
  adicionarOrcamento: (dados) => {
    const novo: Orcamento = { ...dados, id: gerarId(), criado_em: new Date().toISOString() };
    storageOrcamentos.save(novo);
    set(s => ({ orcamentos: [...s.orcamentos, novo] }));
  },
  editarOrcamento: (id, dados) => {
    const lista = get().orcamentos.map(o => o.id === id ? { ...o, ...dados } : o);
    const item = lista.find(o => o.id === id);
    if (item) storageOrcamentos.save(item);
    set({ orcamentos: lista });
  },
  excluirOrcamento: (id) => {
    storageOrcamentos.delete(id);
    set(s => ({ orcamentos: s.orcamentos.filter(o => o.id !== id) }));
  },

  // ── Config / IA ─────────────────────────────────────
  atualizarConfig: (dados) => {
    storageConfig.set(dados);
    set(s => ({ config: { ...s.config, ...dados } }));
  },
  setTaxas: (selic, cdi, ipca) => set({ selicAtual: selic, cdiAtual: cdi, ipcaAtual: ipca }),
  setDicasIA: (dicasIA) => set({ dicasIA }),

  // ── Supabase sync ───────────────────────────────────
  sincronizarDoSupabase: async () => {
    try {
      const dados = await baixarTudoDoSupabase();
      if (!dados.transacoes.length && !dados.contas.length) {
        return { ok: false, msg: 'Nenhum dado encontrado na nuvem.' };
      }
      // Salva no localStorage
      dados.transacoes.forEach(t => storageTransacoes.save(t));
      dados.categorias.forEach(c => storageCategoriass.save(c));
      dados.contas.forEach(c => storageContas.save(c));
      dados.cartoes.forEach(c => storageCartoes.save(c));
      dados.investimentos.forEach(i => storageInvestimentos.save(i));
      // Atualiza store
      set({
        transacoes:    dados.transacoes.length    ? dados.transacoes    : get().transacoes,
        categorias:    dados.categorias.length    ? dados.categorias    : get().categorias,
        contas:        dados.contas.length        ? dados.contas        : get().contas,
        cartoes:       dados.cartoes.length       ? dados.cartoes       : get().cartoes,
        investimentos: dados.investimentos.length ? dados.investimentos : get().investimentos,
      });
      const total = dados.transacoes.length + dados.contas.length + dados.cartoes.length;
      return { ok: true, msg: `${total} registros sincronizados da nuvem!` };
    } catch {
      return { ok: false, msg: 'Erro ao conectar com a nuvem.' };
    }
  },

  enviarParaNuvem: async () => {
    try {
      const s = get();
      await enviarTudoParaSupabase({
        transacoes:    s.transacoes,
        categorias:    s.categorias,
        contas:        s.contas,
        cartoes:       s.cartoes,
        investimentos: s.investimentos,
      });
      const total = s.transacoes.length + s.contas.length + s.cartoes.length;
      return { ok: true, msg: `${total} registros enviados para a nuvem!` };
    } catch {
      return { ok: false, msg: 'Erro ao enviar para a nuvem.' };
    }
  },
}));
