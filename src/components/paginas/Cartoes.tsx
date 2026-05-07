'use client';

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, Pencil, CreditCard, Check, X, AlertCircle, Brain, Loader2, ChevronDown,
} from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { BANCO_INFO, BancoSlug, BandeirCartao, Categoria, Transacao } from '@/types';
import type { TransacaoExtraida } from '@/lib/assistente-types';
import { parseFinancialDate } from '@/lib/date';
import BankLogo from '@/components/ui/BankLogo';
import BankSelector from '@/components/ui/BankSelector';
import CardBrandLogo from '@/components/ui/CardBrandLogo';

const BANDEIRAS: BandeirCartao[] = ['visa', 'mastercard', 'elo', 'amex', 'hipercard'];

type StatusImportacao = {
  cartaoId: string;
  tipo: 'info' | 'sucesso' | 'erro';
  mensagem: string;
};

type RespostaImportacao = {
  tipo?: string;
  resposta?: string;
  totalValor?: number;
  transacoes?: TransacaoExtraida[];
  transacao?: TransacaoExtraida;
  error?: string;
};

function normalizarTexto(valor: string | null | undefined) {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolverCategoriaId(tx: TransacaoExtraida, categorias: Categoria[]) {
  const nomeTx = normalizarTexto(tx.categoria);
  const exata = categorias.find((categoria) => (
    categoria.tipo === tx.tipo && normalizarTexto(categoria.nome) === nomeTx
  ));
  if (exata) return exata.id;

  const mapaFallback: Record<string, string[]> = {
    alimentacao: ['alimentacao', 'almoco', 'restaurante'],
    mercado: ['mercado', 'supermercado', 'atacadao'],
    transporte: ['transporte', 'uber', 'combustivel', 'posto'],
    saude: ['saude', 'hospital', 'clinica'],
    educacao: ['educacao', 'curso', 'faculdade'],
    lazer: ['lazer', 'cinema', 'show'],
    roupas: ['roupas', 'vestuario', 'moda'],
    moradia: ['moradia', 'aluguel', 'casa'],
    assinaturas: ['assinaturas', 'streaming', 'netflix', 'spotify'],
    contas: ['contas', 'energia', 'agua', 'internet'],
    pet: ['pet', 'veterinario'],
    beleza: ['beleza', 'salao'],
    presentes: ['presentes', 'presente'],
    farmacia: ['farmacia', 'drogaria'],
    delivery: ['delivery', 'ifood', 'rappi'],
    salario: ['salario'],
    freelance: ['freelance'],
    rendimentos: ['rendimentos', 'investimento'],
  };

  const fallback = categorias.find((categoria) => {
    if (categoria.tipo !== tx.tipo) return false;
    const nomeCategoria = normalizarTexto(categoria.nome);
    return Object.values(mapaFallback).some((termos) => (
      termos.some((termo) => nomeTx.includes(termo) && nomeCategoria.includes(termo))
    ));
  });

  if (fallback) return fallback.id;

  return categorias.find((categoria) => (
    categoria.tipo === tx.tipo && normalizarTexto(categoria.nome).includes('outros')
  ))?.id || categorias.find((categoria) => categoria.tipo === tx.tipo)?.id || '';
}

function calcularTotalFatura(transacoesExtraidas: TransacaoExtraida[]) {
  return Math.max(0, transacoesExtraidas.reduce((soma, tx) => (
    soma + (tx.tipo === 'despesa' ? tx.valor : -tx.valor)
  ), 0));
}

function ordenarTransacoesPorData(lista: Transacao[]) {
  return [...lista].sort((a, b) => {
    const chaveA = `${a.data}T${a.horario || '00:00'}:${a.id}`;
    const chaveB = `${b.data}T${b.horario || '00:00'}:${b.id}`;
    return chaveA < chaveB ? 1 : -1;
  });
}

export default function Cartoes() {
  const {
    cartoes,
    categorias,
    transacoes,
    config,
    adicionarCartao,
    excluirCartao,
    atualizarFaturaCartao,
    adicionarTransacao,
  } = useFinanceiroStore();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novaFatura, setNovaFatura] = useState('');
  const [cartaoExpandidoId, setCartaoExpandidoId] = useState<string | null>(null);
  const [cartaoImportandoId, setCartaoImportandoId] = useState<string | null>(null);
  const [statusImportacao, setStatusImportacao] = useState<StatusImportacao | null>(null);
  const arquivoCartaoRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    banco: 'nubank' as BancoSlug,
    nome: '',
    limite: '',
    fatura_atual: '',
    dia_vencimento: '15',
    dia_fechamento: '8',
    bandeira: 'mastercard' as BandeirCartao,
  });

  const transacoesPorCartao = useMemo(() => {
    const mapa: Record<string, Transacao[]> = {};
    transacoes.forEach((transacao) => {
      if (!transacao.cartao_id) return;
      mapa[transacao.cartao_id] = [...(mapa[transacao.cartao_id] || []), transacao];
    });
    return mapa;
  }, [transacoes]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    adicionarCartao({
      banco: form.banco,
      nome: form.nome || `${BANCO_INFO[form.banco].nome} ${form.bandeira}`,
      limite: parseFloat(form.limite) || 0,
      fatura_atual: parseFloat(form.fatura_atual) || 0,
      dia_vencimento: parseInt(form.dia_vencimento, 10) || 15,
      dia_fechamento: parseInt(form.dia_fechamento, 10) || 8,
      bandeira: form.bandeira,
    });
    setForm({
      banco: 'nubank',
      nome: '',
      limite: '',
      fatura_atual: '',
      dia_vencimento: '15',
      dia_fechamento: '8',
      bandeira: 'mastercard',
    });
    setMostrarForm(false);
  }

  function salvarFatura(id: string) {
    const valor = parseFloat(novaFatura.replace(',', '.'));
    if (!Number.isNaN(valor)) atualizarFaturaCartao(id, valor);
    setEditandoId(null);
    setNovaFatura('');
  }

  async function handleImportarArquivoCartao(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';

    if (!arquivo || !cartaoImportandoId) return;

    const cartao = cartoes.find((item) => item.id === cartaoImportandoId);
    if (!cartao) return;

    setStatusImportacao({
      cartaoId: cartao.id,
      tipo: 'info',
      mensagem: 'IA analisando a lista de lancamentos do cartao...',
    });

    try {
      const lowerName = arquivo.name.toLowerCase();
      const isPdf = arquivo.type === 'application/pdf' || lowerName.endsWith('.pdf');
      const formData = new FormData();
      const endpoint = isPdf ? '/api/assistente/pdf' : '/api/assistente/imagem';

      if (isPdf) {
        formData.append('pdf', arquivo);
      } else {
        formData.append('imagem', arquivo);
        formData.append('legenda', `Lista de lancamentos do cartao ${cartao.nome} do banco ${BANCO_INFO[cartao.banco].nome}. Extraia data, detalhe da compra, parcela e valor.`);
      }
      formData.append('aiModel', config.ai_modelo_ocr_padrao || 'automatico');

      const resposta = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await resposta.json() as RespostaImportacao;
      if (!resposta.ok) {
        throw new Error(data.error || 'Erro ao analisar o arquivo do cartao.');
      }

      const extraidas = data.transacoes || (data.transacao ? [data.transacao] : []);
      if (!extraidas.length) {
        throw new Error(data.resposta || 'A IA nao encontrou lancamentos validos nesse arquivo.');
      }

      const existentes = [...(transacoesPorCartao[cartao.id] || [])];
      let importadas = 0;

      extraidas.forEach((tx) => {
        const duplicada = existentes.some((existente) => (
          existente.data === tx.data
          && existente.tipo === tx.tipo
          && Math.abs(existente.valor - tx.valor) < 0.01
          && normalizarTexto(existente.descricao) === normalizarTexto(tx.descricao)
        ));

        if (duplicada) return;

        adicionarTransacao({
          valor: tx.valor,
          descricao: tx.descricao,
          categoria_id: resolverCategoriaId(tx, categorias),
          data: tx.data,
          horario: tx.hora || undefined,
          tipo: tx.tipo,
          metodo_pagamento: 'credito',
          parcelas: tx.parcelas || undefined,
          local: tx.local || undefined,
          origem: isPdf ? 'assistente' : 'assistente_imagem',
          cartao_id: cartao.id,
        });

        existentes.push({
          id: `tmp-${cartao.id}-${importadas}`,
          valor: tx.valor,
          descricao: tx.descricao,
          categoria_id: resolverCategoriaId(tx, categorias),
          data: tx.data,
          tipo: tx.tipo,
          origem: isPdf ? 'assistente' : 'assistente_imagem',
          criado_em: new Date().toISOString(),
        });
        importadas += 1;
      });

      const totalFatura = typeof data.totalValor === 'number'
        ? data.totalValor
        : calcularTotalFatura(extraidas);

      atualizarFaturaCartao(cartao.id, totalFatura);
      setCartaoExpandidoId(cartao.id);
      setStatusImportacao({
        cartaoId: cartao.id,
        tipo: 'sucesso',
        mensagem: importadas > 0
          ? `Fatura atualizada para ${formatarMoeda(totalFatura)} e ${importadas} lancamento${importadas > 1 ? 's foram' : ' foi'} incluido${importadas > 1 ? 's' : ''} no cartao.`
          : `Fatura atualizada para ${formatarMoeda(totalFatura)}. Os lancamentos desse arquivo ja estavam cadastrados.`,
      });
    } catch (error) {
      setStatusImportacao({
        cartaoId: cartao.id,
        tipo: 'erro',
        mensagem: error instanceof Error ? error.message : 'Nao foi possivel importar os lancamentos desse cartao.',
      });
    } finally {
      setCartaoImportandoId(null);
    }
  }

  const totalFaturas = cartoes.reduce((soma, cartao) => soma + cartao.fatura_atual, 0);
  const totalLimite = cartoes.reduce((soma, cartao) => soma + cartao.limite, 0);
  const totalDisponivel = totalLimite - totalFaturas;
  const hoje = new Date().getDate();

  return (
    <div className="space-y-5 animate-fade-up">
      <input
        ref={arquivoCartaoRef}
        type="file"
        accept="application/pdf,.pdf,image/*"
        className="hidden"
        onChange={handleImportarArquivoCartao}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">CartÃµes de CrÃ©dito</h2>
          <p className="text-slate-500 text-sm">
            Fatura total:{' '}
            <span className="text-red-400 font-semibold tabular-nums">{formatarMoeda(totalFaturas)}</span>
          </p>
        </div>
        <button
          onClick={() => setMostrarForm((valorAtual) => !valorAtual)}
          className="btn-primary flex items-center gap-2 text-white px-3 py-2 rounded-xl text-sm font-medium"
        >
          <Plus size={16} /> Novo CartÃ£o
        </button>
      </div>

      <div className="glass-card p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Limite Total</div>
            <div className="text-lg font-bold text-white tabular-nums">{formatarMoeda(totalLimite)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">Faturas</div>
            <div className="text-lg font-bold text-red-400 tabular-nums">{formatarMoeda(totalFaturas)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1 uppercase tracking-wide">DisponÃ­vel</div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums">{formatarMoeda(totalDisponivel)}</div>
          </div>
        </div>

        {totalLimite > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Uso do limite</span>
              <span>{((totalFaturas / totalLimite) * 100).toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min((totalFaturas / totalLimite) * 100, 100)}%`,
                  background:
                    totalFaturas / totalLimite > 0.8
                      ? '#EF4444'
                      : totalFaturas / totalLimite > 0.5
                        ? '#F59E0B'
                        : '#7C3AED',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {mostrarForm && (
        <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4 border-purple-500/30">
          <h3 className="text-sm font-semibold text-purple-300">Novo CartÃ£o</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Banco *</label>
              <BankSelector
                selected={form.banco}
                onChange={(banco) => setForm((anterior) => ({ ...anterior, banco }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Bandeira</label>
              <select
                value={form.bandeira}
                onChange={(e) => setForm((anterior) => ({ ...anterior, bandeira: e.target.value as BandeirCartao }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              >
                {BANDEIRAS.map((bandeira) => (
                  <option key={bandeira} value={bandeira}>
                    {bandeira.charAt(0).toUpperCase() + bandeira.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nome do cartÃ£o (opcional)</label>
            <input
              type="text"
              placeholder="Ex: Nubank Roxinho"
              value={form.nome}
              onChange={(e) => setForm((anterior) => ({ ...anterior, nome: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Limite (R$) *</label>
              <input
                type="number"
                placeholder="0,00"
                step="0.01"
                required
                value={form.limite}
                onChange={(e) => setForm((anterior) => ({ ...anterior, limite: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Fatura Atual (R$)</label>
              <input
                type="number"
                placeholder="0,00"
                step="0.01"
                value={form.fatura_atual}
                onChange={(e) => setForm((anterior) => ({ ...anterior, fatura_atual: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Dia do vencimento</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dia_vencimento}
                onChange={(e) => setForm((anterior) => ({ ...anterior, dia_vencimento: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Dia do fechamento</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dia_fechamento}
                onChange={(e) => setForm((anterior) => ({ ...anterior, dia_fechamento: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 text-white py-2.5 rounded-xl text-sm font-semibold">
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setMostrarForm(false)}
              className="px-4 bg-white/5 text-slate-400 py-2.5 rounded-xl text-sm hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {cartoes.map((cartao) => {
          const info = BANCO_INFO[cartao.banco];
          const percentual = cartao.limite > 0 ? (cartao.fatura_atual / cartao.limite) * 100 : 0;
          const disponivel = cartao.limite - cartao.fatura_atual;
          const diasVencimento =
            cartao.dia_vencimento >= hoje ? cartao.dia_vencimento - hoje : 30 - hoje + cartao.dia_vencimento;
          const emEdicao = editandoId === cartao.id;
          const urgente = diasVencimento <= 5 && cartao.fatura_atual > 0;
          const expandido = cartaoExpandidoId === cartao.id;
          const statusAtual = statusImportacao?.cartaoId === cartao.id ? statusImportacao : null;
          const lista = ordenarTransacoesPorData(transacoesPorCartao[cartao.id] || []);
          const compras = lista.filter((transacao) => transacao.tipo === 'despesa');
          const estornos = lista.filter((transacao) => transacao.tipo === 'receita');

          return (
            <div key={cartao.id} className={`glass-card overflow-hidden ${urgente ? 'border-red-500/30' : ''}`}>
              <div
                className="p-5 relative"
                style={{ background: `linear-gradient(135deg, ${info.cor}15 0%, transparent 60%)` }}
              >
                {urgente && (
                  <div className="flex items-center gap-2 text-red-400 text-xs mb-3 font-medium">
                    <AlertCircle size={13} />
                    Vencimento em {diasVencimento} dia{diasVencimento !== 1 ? 's' : ''}!
                  </div>
                )}

                <div className="flex items-center justify-between mb-5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      <BankLogo banco={cartao.banco} size={44} className="h-11 w-11 object-contain" />
                      <CardBrandLogo
                        banco={cartao.banco}
                        nomeCartao={cartao.nome}
                        bandeira={cartao.bandeira}
                        size={20}
                        className="absolute -bottom-1 -right-1 h-5 w-5 object-contain shadow-sm"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{cartao.nome}</div>
                      <div className="text-xs text-slate-500">
                        {info.nome} â€¢ {cartao.bandeira}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setCartaoImportandoId(cartao.id);
                        arquivoCartaoRef.current?.click();
                      }}
                      className="text-purple-300 hover:text-white bg-purple-600/15 border border-purple-500/25 px-2.5 py-1.5 rounded-lg hover:bg-purple-600/25 transition-colors flex items-center gap-1.5 text-xs font-medium"
                      aria-label="Importar fatura com IA"
                    >
                      {cartaoImportandoId === cartao.id ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                      I.A
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditandoId(cartao.id);
                        setNovaFatura(cartao.fatura_atual.toString());
                      }}
                      className="text-slate-500 hover:text-purple-400 p-1.5 rounded-lg hover:bg-purple-900/20 transition-colors"
                      aria-label="Editar fatura"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (confirm('Excluir este cartÃ£o?')) excluirCartao(cartao.id);
                      }}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                      aria-label="Excluir cartÃ£o"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCartaoExpandidoId((atual) => atual === cartao.id ? null : cartao.id)}
                  className="w-full text-left"
                >
                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Fatura Atual</div>
                        {emEdicao ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              autoFocus
                              value={novaFatura}
                              onChange={(e) => setNovaFatura(e.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') salvarFatura(cartao.id);
                              }}
                              className="w-36 bg-white/10 border border-white/20 text-white text-lg rounded-xl px-3 py-1.5 outline-none focus:border-purple-500 tabular-nums font-bold"
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                salvarFatura(cartao.id);
                              }}
                              className="text-emerald-400 p-1.5 rounded-lg hover:bg-emerald-900/20"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditandoId(null);
                              }}
                              className="text-slate-500 p-1.5 rounded-lg hover:bg-white/10"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`text-2xl font-bold tabular-nums ${
                              percentual > 80 ? 'text-red-400' : percentual > 50 ? 'text-yellow-400' : 'text-white'
                            }`}
                          >
                            {formatarMoeda(cartao.fatura_atual)}
                          </div>
                        )}
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-slate-500 transition-transform ${expandido ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(percentual, 100)}%`,
                          background: percentual > 80 ? '#EF4444' : percentual > 50 ? '#F59E0B' : info.cor,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>
                        Usado: <span className="text-slate-300 font-medium">{percentual.toFixed(1)}%</span>
                      </span>
                      <span>
                        Limite:{' '}
                        <span className="text-slate-300 font-medium tabular-nums">{formatarMoeda(cartao.limite)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                      <div className="text-emerald-400 text-sm font-bold tabular-nums">{formatarMoeda(disponivel)}</div>
                      <div className="text-slate-600 text-[11px] mt-0.5">DisponÃ­vel</div>
                    </div>
                    <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                      <div className={`text-sm font-bold ${diasVencimento <= 5 ? 'text-red-400' : 'text-slate-300'}`}>
                        {diasVencimento}d
                      </div>
                      <div className="text-slate-600 text-[11px] mt-0.5">p/ vencer</div>
                    </div>
                    <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                      <div className="text-slate-300 text-sm font-bold">{compras.length}</div>
                      <div className="text-slate-600 text-[11px] mt-0.5">
                        {expandido ? 'lanÃ§amentos visÃ­veis' : 'clique para ver gastos'}
                      </div>
                    </div>
                  </div>
                </button>

                {statusAtual && (
                  <div className={`mt-3 rounded-2xl px-3 py-2 text-xs border ${
                    statusAtual.tipo === 'sucesso'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : statusAtual.tipo === 'erro'
                      ? 'bg-red-500/10 border-red-500/20 text-red-300'
                      : 'bg-purple-500/10 border-purple-500/20 text-purple-300'
                  }`}>
                    {statusAtual.mensagem}
                  </div>
                )}

                {expandido && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Gastos do cartÃ£o</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Os lanÃ§amentos importados pela I.A. ficam vinculados a este cartÃ£o com data, detalhe da compra, parcela e valor.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCartaoImportandoId(cartao.id);
                          arquivoCartaoRef.current?.click();
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
                      >
                        <Brain size={14} />
                        Atualizar com I.A.
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Compras</div>
                        <div className="text-sm font-semibold text-white mt-1">{compras.length}</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Estornos / crÃ©ditos</div>
                        <div className="text-sm font-semibold text-emerald-400 mt-1 tabular-nums">
                          {formatarMoeda(estornos.reduce((soma, transacao) => soma + transacao.valor, 0))}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[11px] text-slate-500">Fechamento</div>
                        <div className="text-sm font-semibold text-white mt-1">Dia {cartao.dia_fechamento}</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {lista.slice(0, 12).map((transacao) => {
                        const categoria = categorias.find((item) => item.id === transacao.categoria_id);
                        return (
                          <div key={transacao.id} className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2 flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm"
                              style={{ background: categoria?.cor ? `${categoria.cor}22` : 'rgba(255,255,255,0.05)' }}
                            >
                              {categoria?.icone || '•'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white truncate">{transacao.descricao}</div>
                              <div className="text-[11px] text-slate-500">
                                {parseFinancialDate(transacao.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                {transacao.parcelas && transacao.parcelas > 1 ? ` • ${transacao.parcelas}x` : ''}
                                {categoria?.nome ? ` • ${categoria.nome}` : ''}
                              </div>
                            </div>
                            <div className={`text-sm font-semibold tabular-nums ${transacao.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {transacao.tipo === 'receita' ? '+' : '-'}{formatarMoeda(transacao.valor)}
                            </div>
                          </div>
                        );
                      })}
                      {lista.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-600">
                          Nenhum gasto visÃ­vel ainda. Clique no botÃ£o I.A. para ler a fatura ou a lista de lanÃ§amentos deste cartÃ£o.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {cartoes.length === 0 && (
          <div className="glass-card flex flex-col items-center justify-center py-14 text-slate-600">
            <CreditCard size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">Nenhum cartÃ£o cadastrado</p>
            <p className="text-xs mt-1">Clique em &quot;Novo CartÃ£o&quot; para comeÃ§ar</p>
          </div>
        )}
      </div>
    </div>
  );
}
