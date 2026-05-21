'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle,
  Layers3,
  Palette,
  Plus,
  ShoppingBag,
  Smile,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { FINANCEIRO_STORAGE_EVENT, formatarMoeda, gerarId, storageSimulacoes } from '@/lib/storage';
import { startOfTodayLocal } from '@/lib/date';
import { aplicarDataCompetenciaNaTransacao, getDataOcorrenciaNoMes, transacaoContaNoMesAteData } from '@/lib/transacoes';
import type { SimulacaoCompra, Transacao } from '@/types';
import PainelPrioridadesFinanceiras, { type ItemPrioridadeFinanceira } from '@/components/ui/PainelPrioridadesFinanceiras';

const CORES_PRESET = [
  '#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316',
  '#14B8A6', '#6366F1', '#A855F7', '#22C55E', '#EAB308',
];

const ICONES_PRESET = [
  '🎯', '🛒', '🍔', '🚗', '💊', '📚', '🎮', '👗', '🏠', '📱',
  '🎬', '🐾', '💄', '🎁', '🏋️', '☕', '🍕', '🎸', '🌿', '💡',
  '🧾', '💰', '🔧', '🏖️', '📦', '🐶', '💻', '🏦', '🪑', '🧳',
];

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

type AbaAtiva = 'orcamento' | 'simulacao';
type PrioridadeSimulacao = NonNullable<SimulacaoCompra['prioridade']>;
type TipoSimulacao = SimulacaoCompra['tipo'];

type ProjecaoMensal = {
  mes: number;
  ano: number;
  label: string;
  real: number;
  simulado: number;
  total: number;
  orcado: number;
  folga: number;
};

function adicionarMeses(mes: number, ano: number, deslocamento: number) {
  const data = new Date(ano, mes - 1 + deslocamento, 1);
  return { mes: data.getMonth() + 1, ano: data.getFullYear() };
}

function chaveMesAno(mes: number, ano: number) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function obterIndiceMes(inicioMes: number, inicioAno: number, mes: number, ano: number) {
  return (ano - inicioAno) * 12 + (mes - inicioMes);
}

function obterParcelaEmCentavos(valorTotal: number, parcelas: number, indice: number) {
  const totalCentavos = Math.round(valorTotal * 100);
  const base = Math.floor(totalCentavos / parcelas);
  const resto = totalCentavos - base * parcelas;
  return base + (indice < resto ? 1 : 0);
}

function obterParcelaFormatada(valorTotal: number, parcelas: number, indice = 0) {
  return obterParcelaEmCentavos(valorTotal, parcelas, indice) / 100;
}

function obterValorSimuladoNoMes(simulacao: SimulacaoCompra, mes: number, ano: number) {
  const indice = obterIndiceMes(simulacao.mes_inicio, simulacao.ano_inicio, mes, ano);
  if (indice < 0 || indice >= simulacao.parcelas) return 0;
  return obterParcelaFormatada(simulacao.valor_total, simulacao.parcelas, indice);
}

function obterClasseSaldo(folga: number) {
  if (folga < 0) return 'text-red-300';
  if (folga < 500) return 'text-amber-200';
  return 'text-emerald-300';
}

function obterClasseBarra(pct: number) {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function Orcamentos() {
  const hoje = useMemo(() => startOfTodayLocal(), []);
  const mesPadraoSimulacao = useMemo(() => adicionarMeses(hoje.getMonth() + 1, hoje.getFullYear(), 1), [hoje]);

  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('orcamento');
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());

  const {
    categorias,
    transacoes,
    orcamentos,
    cartoes,
    adicionarOrcamento,
    editarOrcamento,
    excluirOrcamento,
    adicionarCategoria,
  } = useFinanceiroStore();

  const [modalCatId, setModalCatId] = useState<string | null>(null);
  const [valorInput, setValorInput] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [modalNovaCat, setModalNovaCat] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState({
    nome: '',
    icone: '🎯',
    cor: '#7C3AED',
  });

  const [simulacoes, setSimulacoes] = useState<SimulacaoCompra[]>(() => storageSimulacoes.getAll());
  const [modalSimulacaoId, setModalSimulacaoId] = useState<string | null>(null);
  const [formSimulacao, setFormSimulacao] = useState({
    nome: '',
    descricao: '',
    tipo: 'produto' as TipoSimulacao,
    valor_total: '',
    parcelas: '1',
    mes_inicio: mesPadraoSimulacao.mes,
    ano_inicio: mesPadraoSimulacao.ano,
    prioridade: 'media' as PrioridadeSimulacao,
  });

  useEffect(() => {
    const atualizarSimulacoes = () => setSimulacoes(storageSimulacoes.getAll());
    atualizarSimulacoes();
    window.addEventListener(FINANCEIRO_STORAGE_EVENT, atualizarSimulacoes as EventListener);
    return () => {
      window.removeEventListener(FINANCEIRO_STORAGE_EVENT, atualizarSimulacoes as EventListener);
    };
  }, []);

  const catsDespesa = useMemo(
    () => categorias.filter((categoria) => categoria.tipo === 'despesa'),
    [categorias],
  );

  const orcamentosMes = useMemo(
    () => orcamentos.filter((orcamento) => orcamento.mes === mes && orcamento.ano === ano),
    [orcamentos, mes, ano],
  );

  const gastosPorCat = useMemo(() => {
    const mapa = new Map<string, number>();
    transacoes
      .filter((transacao) => transacao.tipo === 'despesa' && transacaoContaNoMesAteData(transacao, mes, ano, hoje))
      .forEach((transacao) => {
        mapa.set(transacao.categoria_id, (mapa.get(transacao.categoria_id) ?? 0) + transacao.valor);
      });
    return mapa;
  }, [transacoes, mes, ano, hoje]);

  const resumo = useMemo(() => {
    const totalOrcado = orcamentosMes.reduce((soma, orcamento) => soma + orcamento.valor_limite, 0);
    const totalGasto = orcamentosMes.reduce((soma, orcamento) => soma + (gastosPorCat.get(orcamento.categoria_id) ?? 0), 0);
    const pct = totalOrcado > 0 ? (totalGasto / totalOrcado) * 100 : 0;
    return { totalOrcado, totalGasto, pct };
  }, [orcamentosMes, gastosPorCat]);

  const catsOrdenadas = useMemo(() => {
    const comOrcamento = catsDespesa.filter((categoria) => orcamentosMes.some((orcamento) => orcamento.categoria_id === categoria.id));
    const semOrcamento = catsDespesa.filter((categoria) => !orcamentosMes.some((orcamento) => orcamento.categoria_id === categoria.id));
    return [...comOrcamento, ...semOrcamento];
  }, [catsDespesa, orcamentosMes]);

  const totaisOrcadosPorMes = useMemo(() => {
    const mapa = new Map<string, number>();
    orcamentos.forEach((orcamento) => {
      const chave = chaveMesAno(orcamento.mes, orcamento.ano);
      mapa.set(chave, (mapa.get(chave) ?? 0) + orcamento.valor_limite);
    });
    return mapa;
  }, [orcamentos]);

  const simulacoesOrdenadas = useMemo(() => {
    return [...simulacoes].sort((a, b) => {
      const inicioA = chaveMesAno(a.mes_inicio, a.ano_inicio);
      const inicioB = chaveMesAno(b.mes_inicio, b.ano_inicio);
      if (inicioA !== inicioB) return inicioA.localeCompare(inicioB);
      return b.valor_total - a.valor_total;
    });
  }, [simulacoes]);

  const projecoes = useMemo(() => {
    return Array.from({ length: 8 }, (_, indice) => {
      const periodo = adicionarMeses(mes, ano, indice);
      const chave = chaveMesAno(periodo.mes, periodo.ano);

      const real = transacoes.reduce((soma, transacao) => {
        if (transacao.tipo !== 'despesa') return soma;
        const cartao = transacao.cartao_id ? cartoes.find((item) => item.id === transacao.cartao_id) : undefined;
        const transacaoCompetencia = cartao ? aplicarDataCompetenciaNaTransacao(transacao, cartao) : transacao;
        return getDataOcorrenciaNoMes(transacaoCompetencia, periodo.mes, periodo.ano) ? soma + transacao.valor : soma;
      }, 0);

      const simulado = simulacoes.reduce((soma, simulacao) => {
        return soma + obterValorSimuladoNoMes(simulacao, periodo.mes, periodo.ano);
      }, 0);

      const orcado = totaisOrcadosPorMes.get(chave) ?? 0;
      const total = real + simulado;
      const folga = orcado - total;

      return {
        mes: periodo.mes,
        ano: periodo.ano,
        label: `${MESES[periodo.mes - 1].slice(0, 3)}/${String(periodo.ano).slice(-2)}`,
        real,
        simulado,
        total,
        orcado,
        folga,
      } satisfies ProjecaoMensal;
    });
  }, [ano, cartoes, mes, simulacoes, totaisOrcadosPorMes, transacoes]);

  const melhorJanela = useMemo(() => {
    return [...projecoes].sort((a, b) => b.folga - a.folga || a.total - b.total)[0];
  }, [projecoes]);

  const resumoSimulacaoAtual = projecoes[0];
  const totalCarteiraSimulada = simulacoes.reduce((soma, simulacao) => soma + simulacao.valor_total, 0);
  const totalParcelasAbertas = simulacoes.reduce((soma, simulacao) => soma + simulacao.parcelas, 0);
  const prioridadesFinanceiras = useMemo<ItemPrioridadeFinanceira[]>(() => {
    const mesesNoLimite = projecoes.filter((projecao) => projecao.folga < 0);
    const mesesApertados = projecoes.filter((projecao) => projecao.folga >= 0 && projecao.folga < 500);
    const prioridadesAltas = simulacoes.filter((simulacao) => simulacao.prioridade === 'alta');
    return [
      {
        id: 'orcamentos-limite',
        titulo: 'Meses no vermelho',
        detalhe: 'Projeções em que o total previsto passa do orçamento consolidado.',
        quantidade: mesesNoLimite.length,
        tone: 'danger',
      },
      {
        id: 'orcamentos-apertados',
        titulo: 'Folga apertada',
        detalhe: 'Meses com menos de R$ 500 de respiro frente ao orçamento.',
        quantidade: mesesApertados.length,
        tone: 'warning',
      },
      {
        id: 'orcamentos-altas',
        titulo: 'Simulações prioritárias',
        detalhe: 'Compras marcadas como prioridade alta.',
        quantidade: prioridadesAltas.length,
        valor: formatarMoeda(prioridadesAltas.reduce((soma, simulacao) => soma + simulacao.valor_total, 0)),
        tone: 'info',
      },
      {
        id: 'orcamentos-impacto',
        titulo: 'Impacto simulado',
        detalhe: 'Parcela simulada que já entra no mês-base da análise.',
        valor: formatarMoeda(resumoSimulacaoAtual?.simulado || 0),
        tone: (resumoSimulacaoAtual?.simulado || 0) > 0 ? 'success' : 'info',
      },
    ];
  }, [projecoes, resumoSimulacaoAtual, simulacoes]);

  function abrirModal(catId: string) {
    const orcamento = orcamentosMes.find((item) => item.categoria_id === catId);
    setValorInput(orcamento ? String(orcamento.valor_limite) : '');
    setModalCatId(catId);
  }

  function fecharModal() {
    setModalCatId(null);
    setValorInput('');
  }

  function salvarOrcamento() {
    if (!modalCatId) return;
    const valor = parseFloat(valorInput.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) return;

    setSalvando(true);
    const existente = orcamentosMes.find((orcamento) => orcamento.categoria_id === modalCatId);
    if (existente) {
      editarOrcamento(existente.id, { valor_limite: valor });
    } else {
      adicionarOrcamento({ categoria_id: modalCatId, valor_limite: valor, mes, ano });
    }

    for (let i = 1; i <= 24; i += 1) {
      const futuro = adicionarMeses(mes, ano, i);
      const orcamentoFuturo = orcamentos.find((orcamento) => (
        orcamento.categoria_id === modalCatId && orcamento.mes === futuro.mes && orcamento.ano === futuro.ano
      ));

      if (orcamentoFuturo) {
        editarOrcamento(orcamentoFuturo.id, { valor_limite: valor });
      } else {
        adicionarOrcamento({ categoria_id: modalCatId, valor_limite: valor, mes: futuro.mes, ano: futuro.ano });
      }
    }

    setSalvando(false);
    fecharModal();
  }

  function removerOrcamento(catId: string) {
    const orcamento = orcamentosMes.find((item) => item.categoria_id === catId);
    if (orcamento) excluirOrcamento(orcamento.id);
  }

  function criarNovaCategoria() {
    if (!novaCategoria.nome.trim()) return;
    adicionarCategoria({
      nome: novaCategoria.nome.trim(),
      icone: novaCategoria.icone,
      cor: novaCategoria.cor,
      tipo: 'despesa',
    });
    setNovaCategoria({ nome: '', icone: '🎯', cor: '#7C3AED' });
    setModalNovaCat(false);
  }

  function resetarFormSimulacao() {
    setFormSimulacao({
      nome: '',
      descricao: '',
      tipo: 'produto',
      valor_total: '',
      parcelas: '1',
      mes_inicio: mesPadraoSimulacao.mes,
      ano_inicio: mesPadraoSimulacao.ano,
      prioridade: 'media',
    });
    setModalSimulacaoId(null);
  }

  function abrirNovaSimulacao(simulacao?: SimulacaoCompra) {
    if (simulacao) {
      setModalSimulacaoId(simulacao.id);
      setFormSimulacao({
        nome: simulacao.nome,
        descricao: simulacao.descricao || '',
        tipo: simulacao.tipo,
        valor_total: String(simulacao.valor_total),
        parcelas: String(simulacao.parcelas),
        mes_inicio: simulacao.mes_inicio,
        ano_inicio: simulacao.ano_inicio,
        prioridade: simulacao.prioridade || 'media',
      });
      return;
    }

    resetarFormSimulacao();
    setModalSimulacaoId('nova');
  }

  function salvarSimulacao() {
    if (!modalSimulacaoId) return;

    const valorTotal = parseFloat(formSimulacao.valor_total.replace(',', '.'));
    const parcelas = Math.max(parseInt(formSimulacao.parcelas, 10) || 1, 1);
    if (!formSimulacao.nome.trim() || isNaN(valorTotal) || valorTotal <= 0) return;

    const existente = modalSimulacaoId === 'nova'
      ? null
      : simulacoes.find((item) => item.id === modalSimulacaoId);
    const agora = new Date().toISOString();

    const registro: SimulacaoCompra = {
      id: existente?.id || gerarId(),
      nome: formSimulacao.nome.trim(),
      descricao: formSimulacao.descricao.trim() || undefined,
      tipo: formSimulacao.tipo,
      valor_total: valorTotal,
      parcelas,
      mes_inicio: formSimulacao.mes_inicio,
      ano_inicio: formSimulacao.ano_inicio,
      prioridade: formSimulacao.prioridade,
      criado_em: existente?.criado_em || agora,
      atualizado_em: agora,
    };

    storageSimulacoes.save(registro);
    setSimulacoes(storageSimulacoes.getAll());
    resetarFormSimulacao();
  }

  function excluirSimulacao(id: string) {
    storageSimulacoes.delete(id);
    setSimulacoes(storageSimulacoes.getAll());
  }

  const anosOpcoes = [hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1, hoje.getFullYear() + 2];

  return (
    <div className="space-y-6 animate-fade-up">
      <section className="fin-panel fin-soft-rise rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(10,14,26,0.92))] p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-500/25 bg-purple-600/18">
              <Target size={18} className="text-purple-300" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Orçamentos 3.0</p>
              <h1 className="mt-1 text-xl font-bold text-white">Orçamentos</h1>
              <p className="mt-2 text-sm text-slate-400">Controle real por categoria e simulação de compras futuras na mesma estrutura das outras telas.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setAbaAtiva('orcamento')}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-all ${
                abaAtiva === 'orcamento'
                  ? 'border border-purple-500/30 bg-purple-600/20 text-purple-200'
                  : 'border border-white/10 bg-white/[0.04] text-slate-400 hover:text-slate-200'
              }`}
            >
              Orçamento Real
            </button>
            <button
              onClick={() => setAbaAtiva('simulacao')}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-all ${
                abaAtiva === 'simulacao'
                  ? 'border border-sky-500/30 bg-sky-500/15 text-sky-200'
                  : 'border border-white/10 bg-white/[0.04] text-slate-400 hover:text-slate-200'
              }`}
            >
              Orçamento de Simulação
            </button>
          </div>
        </div>
      </section>

      <div className="text-xs text-slate-500">Resumo principal, visão analítica e detalhe por categoria ou simulação.</div>

      <PainelPrioridadesFinanceiras
        itens={prioridadesFinanceiras}
        subtitulo="Prioridades da visão real e da simulação para ajudar a decidir o que cabe agora e o que pressiona os próximos meses."
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="flex-1 rounded-xl border border-white/10 bg-[#0F1629] px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
        >
          {MESES.map((nome, indice) => (
            <option key={nome} value={indice + 1}>{nome}</option>
          ))}
        </select>
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50 sm:w-28"
        >
          {anosOpcoes.map((itemAno) => (
            <option key={itemAno} value={itemAno}>{itemAno}</option>
          ))}
        </select>
      </div>

      {abaAtiva === 'orcamento' && (
        <>
          <div className="flex items-center justify-end">
            <button
              onClick={() => setModalNovaCat(true)}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-400 transition-all hover:border-purple-500/30 hover:text-purple-300"
            >
              <Plus size={13} />
              Nova Categoria
            </button>
          </div>

          {resumo.totalOrcado > 0 && (
            <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-[#0F1629] p-4">
              <div className="mb-1 flex items-center gap-2">
                <TrendingUp size={14} className="text-purple-400" />
                <span className="text-sm font-semibold text-slate-300">Resumo do mês</span>
              </div>
              <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
                <div>
                  <p className="mb-0.5 text-[11px] text-slate-500">Orçado</p>
                  <p className="text-sm font-bold tabular-nums text-white">{formatarMoeda(resumo.totalOrcado)}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] text-slate-500">Gasto</p>
                  <p className={`text-sm font-bold tabular-nums ${resumo.pct >= 90 ? 'text-red-400' : resumo.pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {formatarMoeda(resumo.totalGasto)}
                  </p>
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] text-slate-500">Utilizado</p>
                  <p className={`text-sm font-bold tabular-nums ${resumo.pct >= 90 ? 'text-red-400' : resumo.pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {resumo.pct.toFixed(0)}%
                  </p>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div className={`h-full rounded-full transition-all duration-700 ${obterClasseBarra(resumo.pct)}`} style={{ width: `${Math.min(resumo.pct, 100)}%` }} />
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-[11px] text-slate-500">
                <div><span className="text-slate-300">Orçado:</span> soma dos limites definidos para as categorias do mês.</div>
                <div className="mt-1"><span className="text-slate-300">Gasto:</span> despesas já realizadas nas categorias que têm orçamento.</div>
                <div className="mt-1"><span className="text-slate-300">Utilizado:</span> percentual entre o gasto atual e o limite total configurado.</div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {catsOrdenadas.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0F1629] p-10 text-slate-600">
                <Target size={32} className="opacity-30" />
                <p className="text-center text-sm">Nenhuma categoria de despesa cadastrada</p>
                <button
                  onClick={() => setModalNovaCat(true)}
                  className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-600/20 px-4 py-2 text-xs font-medium text-purple-400 transition-colors hover:bg-purple-600/30"
                >
                  <Plus size={13} />
                  Criar primeira categoria
                </button>
              </div>
            )}

            {catsOrdenadas.map((categoria) => {
              const orcamento = orcamentosMes.find((item) => item.categoria_id === categoria.id);
              const gasto = gastosPorCat.get(categoria.id) ?? 0;
              const limite = orcamento?.valor_limite ?? 0;
              const pct = limite > 0 ? (gasto / limite) * 100 : 0;

              return (
                <div key={categoria.id} className="rounded-2xl border border-white/[0.06] bg-[#0F1629] p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm"
                      style={{ background: `${categoria.cor}22`, color: categoria.cor }}
                    >
                      {categoria.icone}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{categoria.nome}</p>
                      {orcamento ? (
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {formatarMoeda(gasto)} / {formatarMoeda(limite)}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-600">Sem limite definido</p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {orcamento && (
                        pct >= 90
                          ? <AlertTriangle size={13} className="text-red-400" />
                          : pct >= 70
                            ? <AlertTriangle size={13} className="text-amber-400" />
                            : <CheckCircle size={13} className="text-emerald-400" />
                      )}
                      {orcamento && (
                        <button
                          onClick={() => removerOrcamento(categoria.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          title="Remover orçamento"
                        >
                          <X size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => abrirModal(categoria.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-600/20 text-purple-400 transition-colors hover:bg-purple-600/30"
                        title={orcamento ? 'Editar limite' : 'Definir limite'}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {orcamento ? (
                    <div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className={`h-full rounded-full transition-all duration-700 ${obterClasseBarra(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between">
                        <span className={`text-[10px] font-medium ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {pct.toFixed(0)}% utilizado
                        </span>
                        {pct > 100 && (
                          <span className="text-[10px] font-semibold text-red-400">
                            +{formatarMoeda(gasto - limite)} acima
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-1.5 rounded-full bg-white/5" />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {abaAtiva === 'simulacao' && (
        <>
          <div className="fin-panel fin-soft-rise-delay overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_32%),radial-gradient(circle_at_top_right,rgba(124,58,237,0.18),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(10,14,26,0.92))] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                  Simulação inteligente
                </div>
                <h2 className="text-xl font-bold text-white">Planeje compras altas antes de assumir novas parcelas</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Esta visão soma suas despesas reais já previstas para os próximos meses com compras desejadas simuladas, mostrando o peso mensal antes de decidir.
                </p>
              </div>
              <button
                onClick={() => abrirNovaSimulacao()}
                className="fin-button-press flex items-center gap-2 rounded-2xl border border-sky-400/25 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-200 transition-all hover:bg-sky-500/25"
              >
                <Plus size={16} />
                Nova simulação
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="fin-panel rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Mês analisado</div>
                <div className="mt-2 text-base font-bold text-white">{MESES[mes - 1]}/{ano}</div>
                <div className="mt-1 text-[11px] text-slate-500">Base para a projeção abaixo</div>
              </div>
              <div className="fin-panel rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Base real prevista</div>
                <div className="mt-2 text-base font-bold text-amber-200">{formatarMoeda(resumoSimulacaoAtual?.real || 0)}</div>
                <div className="mt-1 text-[11px] text-slate-500">Recorrências, parcelas e lançamentos futuros já reais</div>
              </div>
              <div className="fin-panel rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Impacto simulado</div>
                <div className="mt-2 text-base font-bold text-sky-200">{formatarMoeda(resumoSimulacaoAtual?.simulado || 0)}</div>
                <div className="mt-1 text-[11px] text-slate-500">Parcelas que você está pensando em assumir</div>
              </div>
              <div className="fin-panel rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Total projetado</div>
                <div className={`mt-2 text-base font-bold ${obterClasseSaldo(resumoSimulacaoAtual?.folga || 0)}`}>
                  {formatarMoeda(resumoSimulacaoAtual?.total || 0)}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {resumoSimulacaoAtual?.orcado
                    ? `Folga vs orçamento: ${formatarMoeda(resumoSimulacaoAtual.folga)}`
                    : 'Sem orçamento consolidado para este mês'}
                </div>
              </div>
            </div>
            <div className="fin-panel rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-[11px] text-slate-500">
              <div><span className="text-slate-300">Base real prevista:</span> recorrências, parcelas e lançamentos já existentes que caem no mês.</div>
              <div className="mt-1"><span className="text-slate-300">Impacto simulado:</span> parcelas das compras desejadas adicionadas artificialmente à projeção.</div>
              <div className="mt-1"><span className="text-slate-300">Total projetado:</span> base real prevista + novas simulações do mês.</div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.05fr_1.35fr]">
            <section className="fin-panel rounded-3xl border border-white/[0.08] bg-[#0F1629] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <ShoppingBag size={15} className="text-sky-300" />
                    Compras em simulação
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Produtos ou combos que você quer testar antes de comprar</p>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Carteira simulada</div>
                  <div className="mt-2 text-base font-bold text-white">{formatarMoeda(totalCarteiraSimulada)}</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Parcelas abertas</div>
                  <div className="mt-2 text-base font-bold text-white">{totalParcelasAbertas}</div>
                </div>
              </div>

              <div className="space-y-3">
                {simulacoesOrdenadas.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center">
                    <Sparkles size={24} className="mx-auto mb-3 text-slate-500" />
                    <p className="text-sm text-slate-300">Nenhuma compra simulada ainda</p>
                    <p className="mt-1 text-xs text-slate-500">Cadastre um produto, combo ou compra futura e veja o efeito no orçamento mês a mês.</p>
                  </div>
                )}

                {simulacoesOrdenadas.map((simulacao) => {
                  const primeiraParcela = obterParcelaFormatada(simulacao.valor_total, simulacao.parcelas, 0);
                  return (
                    <div key={simulacao.id} className="fin-panel fin-panel-interactive rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                              simulacao.tipo === 'combo'
                                ? 'bg-purple-500/15 text-purple-200'
                                : 'bg-sky-500/15 text-sky-200'
                            }`}>
                              {simulacao.tipo === 'combo' ? 'Combo' : 'Produto'}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                              simulacao.prioridade === 'alta'
                                ? 'bg-red-500/12 text-red-200'
                                : simulacao.prioridade === 'media'
                                  ? 'bg-amber-500/12 text-amber-200'
                                  : 'bg-emerald-500/12 text-emerald-200'
                            }`}>
                              Prioridade {simulacao.prioridade}
                            </span>
                          </div>
                          <h3 className="truncate text-sm font-semibold text-white">{simulacao.nome}</h3>
                          {simulacao.descricao && (
                            <p className="mt-1 text-xs text-slate-400">{simulacao.descricao}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => abrirNovaSimulacao(simulacao)}
                            className="rounded-lg border border-white/10 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/[0.04]"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => excluirSimulacao(simulacao.id)}
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                            title="Excluir simulação"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-white/[0.03] p-3">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Valor total</div>
                          <div className="mt-1 text-sm font-bold text-white">{formatarMoeda(simulacao.valor_total)}</div>
                        </div>
                        <div className="rounded-xl bg-white/[0.03] p-3">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Primeira parcela</div>
                          <div className="mt-1 text-sm font-bold text-sky-200">{formatarMoeda(primeiraParcela)}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-400">
                        <span>{simulacao.parcelas}x</span>
                        <span>Início em {MESES[simulacao.mes_inicio - 1]}/{simulacao.ano_inicio}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="fin-panel rounded-3xl border border-white/[0.08] bg-[#0F1629] p-4">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <CalendarRange size={15} className="text-amber-300" />
                    Projeção dos próximos 8 meses
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Base real prevista + novas compras simuladas</p>
                </div>
                {melhorJanela && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-200">Melhor respiro</div>
                    <div className="mt-1 text-sm font-bold text-white">{melhorJanela.label}</div>
                    <div className="mt-0.5 text-[11px] text-emerald-200">Folga estimada {formatarMoeda(melhorJanela.folga)}</div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {projecoes.map((projecao) => {
                  const percentual = projecao.orcado > 0 ? (projecao.total / projecao.orcado) * 100 : 0;
                  return (
                    <div key={`${projecao.mes}-${projecao.ano}`} className="fin-panel rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-white">{projecao.label}</h3>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {projecao.orcado > 0
                              ? `Orçamento consolidado ${formatarMoeda(projecao.orcado)}`
                              : 'Sem orçamento consolidado'}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`text-base font-bold ${obterClasseSaldo(projecao.folga)}`}>{formatarMoeda(projecao.total)}</div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {projecao.orcado > 0 ? `Folga ${formatarMoeda(projecao.folga)}` : 'Total previsto'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="rounded-xl bg-white/[0.03] p-3">
                          <div className="text-slate-500">Base real</div>
                          <div className="mt-1 font-semibold text-white">{formatarMoeda(projecao.real)}</div>
                        </div>
                        <div className="rounded-xl bg-sky-500/8 p-3">
                          <div className="text-sky-200/80">Simulado</div>
                          <div className="mt-1 font-semibold text-sky-200">{formatarMoeda(projecao.simulado)}</div>
                        </div>
                        <div className="rounded-xl bg-white/[0.03] p-3">
                          <div className="text-slate-500">Comprometimento</div>
                          <div className={`mt-1 font-semibold ${projecao.orcado > 0 ? obterClasseSaldo(projecao.folga) : 'text-slate-200'}`}>
                            {projecao.orcado > 0 ? `${percentual.toFixed(0)}%` : 'Sem base'}
                          </div>
                        </div>
                      </div>

                      {projecao.orcado > 0 && (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div className={`h-full rounded-full transition-all duration-500 ${obterClasseBarra(percentual)}`} style={{ width: `${Math.min(percentual, 100)}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}

      {modalCatId && (() => {
        const categoria = categorias.find((item) => item.id === modalCatId);
        const orcamento = orcamentosMes.find((item) => item.categoria_id === modalCatId);

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={fecharModal}>
            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/[0.08] bg-[#0A0E1A] p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: `${categoria?.cor}22`, color: categoria?.cor }}>
                    {categoria?.icone}
                  </div>
                  <p className="text-sm font-semibold text-white">{categoria?.nome}</p>
                </div>
                <button onClick={fecharModal} className="text-slate-500 transition-colors hover:text-slate-300">
                  <X size={18} />
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-slate-500">
                  {orcamento ? 'Novo limite mensal (R$)' : 'Limite mensal (R$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 500"
                  value={valorInput}
                  onChange={(e) => setValorInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && salvarOrcamento()}
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-base font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                />
                <p className="mt-1.5 text-[11px] text-slate-600">
                  Aplica este limite a partir de {`${MESES[mes - 1]}/${ano}`} e todos os meses seguintes
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={fecharModal}
                  className="flex-1 rounded-xl border border-white/10 bg-white/4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/8"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarOrcamento}
                  disabled={salvando || !valorInput}
                  className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                >
                  {orcamento ? 'Atualizar' : 'Definir'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {modalNovaCat && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setModalNovaCat(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0E1A] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl text-lg" style={{ background: `${novaCategoria.cor}22` }}>
                  {novaCategoria.icone}
                </div>
                <h3 className="text-sm font-bold text-white">Nova Categoria de Orçamento</h3>
              </div>
              <button onClick={() => setModalNovaCat(false)} className="p-1 text-slate-500 transition-colors hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Nome da Categoria *</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex: Viagens, Academia, Pets..."
                  value={novaCategoria.nome}
                  onChange={(e) => setNovaCategoria((anterior) => ({ ...anterior, nome: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>

              {novaCategoria.nome && (
                <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: `${novaCategoria.cor}22`, color: novaCategoria.cor }}>
                    {novaCategoria.icone}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{novaCategoria.nome}</p>
                    <p className="text-xs text-slate-500">Categoria de despesa</p>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-400">
                  <Smile size={12} /> Ícone
                </label>
                <div className="grid grid-cols-10 gap-1.5">
                  {ICONES_PRESET.map((icone) => (
                    <button
                      key={icone}
                      type="button"
                      onClick={() => setNovaCategoria((anterior) => ({ ...anterior, icone }))}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-all ${
                        novaCategoria.icone === icone
                          ? 'scale-110 bg-purple-600/20 ring-2 ring-purple-500'
                          : 'bg-white/[0.04] hover:bg-white/[0.08]'
                      }`}
                    >
                      {icone}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-400">
                  <Palette size={12} /> Cor
                </label>
                <div className="flex flex-wrap gap-2">
                  {CORES_PRESET.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() => setNovaCategoria((anterior) => ({ ...anterior, cor }))}
                      className={`h-7 w-7 rounded-full transition-all ${
                        novaCategoria.cor === cor ? 'scale-110 ring-2 ring-white ring-offset-1 ring-offset-[#0A0E1A]' : 'hover:scale-105'
                      }`}
                      style={{ background: cor }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setModalNovaCat(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.08]"
              >
                Cancelar
              </button>
              <button
                onClick={criarNovaCategoria}
                disabled={!novaCategoria.nome.trim()}
                className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
              >
                Criar Categoria
              </button>
            </div>
          </div>
        </div>
      )}

      {modalSimulacaoId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={resetarFormSimulacao}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0E1A] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-200">
                  <Layers3 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {modalSimulacaoId === 'nova' ? 'Nova compra simulada' : 'Editar compra simulada'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Salva localmente no app e entra no backup local</p>
                </div>
              </div>
              <button onClick={resetarFormSimulacao} className="p-1 text-slate-500 transition-colors hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Nome da compra *</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Ex: Notebook, sofá, kit home office..."
                    value={formSimulacao.nome}
                    onChange={(e) => setFormSimulacao((anterior) => ({ ...anterior, nome: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Tipo</label>
                  <select
                    value={formSimulacao.tipo}
                    onChange={(e) => setFormSimulacao((anterior) => ({ ...anterior, tipo: e.target.value as TipoSimulacao }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  >
                    <option value="produto">Produto</option>
                    <option value="combo">Combo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Descrição opcional</label>
                <textarea
                  rows={3}
                  placeholder="Use para agrupar itens, lembrar motivo ou anotar composição do combo"
                  value={formSimulacao.descricao}
                  onChange={(e) => setFormSimulacao((anterior) => ({ ...anterior, descricao: e.target.value }))}
                  className="w-full resize-none rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Valor total (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={formSimulacao.valor_total}
                    onChange={(e) => setFormSimulacao((anterior) => ({ ...anterior, valor_total: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Parcelas</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formSimulacao.parcelas}
                    onChange={(e) => setFormSimulacao((anterior) => ({ ...anterior, parcelas: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Mês inicial</label>
                  <select
                    value={formSimulacao.mes_inicio}
                    onChange={(e) => setFormSimulacao((anterior) => ({ ...anterior, mes_inicio: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  >
                    {MESES.map((nome, indice) => (
                      <option key={nome} value={indice + 1}>{nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Ano inicial</label>
                  <select
                    value={formSimulacao.ano_inicio}
                    onChange={(e) => setFormSimulacao((anterior) => ({ ...anterior, ano_inicio: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  >
                    {anosOpcoes.concat(hoje.getFullYear() + 3).map((itemAno) => (
                      <option key={itemAno} value={itemAno}>{itemAno}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Prioridade</label>
                  <select
                    value={formSimulacao.prioridade}
                    onChange={(e) => setFormSimulacao((anterior) => ({ ...anterior, prioridade: e.target.value as PrioridadeSimulacao }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0F1629] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-500/15 bg-sky-500/10 p-4">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-sky-100">
                  <Sparkles size={14} />
                  Prévia da simulação
                </div>
                <p className="text-xs text-slate-300">
                  {formSimulacao.valor_total
                    ? `${formSimulacao.tipo === 'combo' ? 'Combo' : 'Produto'} começa em ${MESES[formSimulacao.mes_inicio - 1]}/${formSimulacao.ano_inicio} com parcela inicial estimada de ${formatarMoeda(obterParcelaFormatada(parseFloat(formSimulacao.valor_total || '0'), Math.max(parseInt(formSimulacao.parcelas, 10) || 1, 1)))}.`
                    : 'Preencha o valor total e as parcelas para ver o impacto mensal estimado.'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={resetarFormSimulacao}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/[0.08]"
              >
                Cancelar
              </button>
              <button
                onClick={salvarSimulacao}
                disabled={!formSimulacao.nome.trim() || !formSimulacao.valor_total}
                className="flex-1 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
              >
                {modalSimulacaoId === 'nova' ? 'Adicionar simulação' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Orcamentos;
