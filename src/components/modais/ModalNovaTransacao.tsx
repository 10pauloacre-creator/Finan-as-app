'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Camera, Brain, Loader2, CheckCircle, Trash2 } from 'lucide-react';
import { useFinanceiroStore } from '@/store/useFinanceiroStore';
import { formatarMoeda } from '@/lib/storage';
import { ClassificacaoTransacao, MetodoPagamento, TipoTransacao, Transacao, BANCO_INFO } from '@/types';
import { detectarDuplicata } from '@/lib/duplicata';
import ModalDuplicata from './ModalDuplicata';
import { formatFinancialDate } from '@/lib/date';
import { getDataCobrancaCartao } from '@/lib/transacoes';
import BankLogo from '@/components/ui/BankLogo';
import OCRModelSelect from '@/components/ui/OCRModelSelect';

interface ItemCompraExtraido {
  nome: string;
  valor: number | null;
  quantidade?: number | null;
  unidade?: string | null;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  transacaoEditar?: Transacao;
  tipoInicial?: TipoTransacao;
}

type FormState = {
  descricao: string;
  valor: string;
  tipo: TipoTransacao;
  classificacao: ClassificacaoTransacao;
  categoria_id: string;
  data: string;
  data_cobranca: string;
  horario: string;
  metodo_pagamento: MetodoPagamento;
  parcelas: string;
  parcela_atual: string;
  local: string;
  observacoes: string;
  conta_id: string;
  cartao_id: string;
};

const METODOS: { valor: MetodoPagamento; label: string; icone: string }[] = [
  { valor: 'pix', label: 'Pix', icone: 'PIX' },
  { valor: 'debito', label: 'Debito', icone: 'DB' },
  { valor: 'credito', label: 'Credito', icone: 'CR' },
  { valor: 'emprestimo', label: 'Emprestimo', icone: 'EMP' },
  { valor: 'financiamento', label: 'Financiamento', icone: 'FIN' },
  { valor: 'dinheiro', label: 'Dinheiro', icone: 'R$' },
  { valor: 'transferencia', label: 'TED/DOC', icone: 'TED' },
  { valor: 'outro', label: 'Outro', icone: 'OUT' },
];

function getFormVazio(tipo: TipoTransacao = 'despesa'): FormState {
  return {
    descricao: '',
    valor: '',
    tipo,
    classificacao: 'padrao',
    categoria_id: '',
    data: formatFinancialDate(new Date()),
    data_cobranca: tipo === 'despesa' ? formatFinancialDate(new Date()) : '',
    horario: '',
    metodo_pagamento: 'pix',
    parcelas: '1',
    parcela_atual: '0',
    local: '',
    observacoes: '',
    conta_id: '',
    cartao_id: '',
  };
}

export default function ModalNovaTransacao({ aberto, onFechar, transacaoEditar, tipoInicial = 'despesa' }: Props) {
  const {
    categorias,
    contas,
    cartoes,
    transacoes,
    adicionarTransacao,
    editarTransacao,
    excluirTransacao,
    config,
    atualizarConfig,
  } = useFinanceiroStore();

  const [form, setForm] = useState<FormState>(() => getFormVazio(tipoInicial));
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erroIA, setErroIA] = useState('');
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [itensCompraIA, setItensCompraIA] = useState<ItemCompraExtraido[]>([]);
  const [duplicataEncontrada, setDuplicataEncontrada] = useState<Transacao | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (transacaoEditar) {
        setItensCompraIA(transacaoEditar.itens_compra || []);
        setForm({
          descricao: transacaoEditar.descricao,
          valor: transacaoEditar.valor.toString(),
          tipo: transacaoEditar.tipo,
          classificacao: transacaoEditar.classificacao || 'padrao',
          categoria_id: transacaoEditar.categoria_id,
          data: transacaoEditar.data,
          data_cobranca: transacaoEditar.tipo === 'despesa'
            ? (
                transacaoEditar.data_cobranca
                || (
                  transacaoEditar.cartao_id
                    ? getDataCobrancaCartao(
                        transacaoEditar,
                        cartoes.find((cartao) => cartao.id === transacaoEditar.cartao_id),
                      )
                    : transacaoEditar.data
                )
              )
            : '',
          horario: transacaoEditar.horario || '',
          metodo_pagamento: transacaoEditar.metodo_pagamento || 'pix',
          parcelas: transacaoEditar.parcelas?.toString() || '1',
          parcela_atual: transacaoEditar.parcela_atual?.toString() || '0',
          local: transacaoEditar.local || '',
          observacoes: transacaoEditar.observacoes || '',
          conta_id: transacaoEditar.conta_id || '',
          cartao_id: transacaoEditar.cartao_id || '',
        });
      } else {
        setForm(getFormVazio(tipoInicial));
        setFotoPreview(null);
        setItensCompraIA([]);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [transacaoEditar, aberto, tipoInicial, cartoes]);

  const categoriaSelecionada = categorias.find((categoria) => categoria.id === form.categoria_id);
  const categoriasFiltradas = categorias.filter((categoria) => categoria.tipo === form.tipo);
  const mostrarContaSelector = ['pix', 'debito', 'transferencia', 'emprestimo', 'financiamento'].includes(form.metodo_pagamento);
  const mostrarCartaoSelector = form.metodo_pagamento === 'credito';
  const usaControleDeSerie =
    (form.tipo === 'despesa' && ['emprestimo', 'financiamento'].includes(form.metodo_pagamento))
    || (form.tipo === 'receita' && form.classificacao === 'fixa');
  const contaObrigatoria = mostrarContaSelector && contas.length > 0;
  const cartaoObrigatorio = mostrarCartaoSelector && cartoes.length > 0;
  const formularioValido = Boolean(form.descricao && form.valor && form.categoria_id)
    && (!contaObrigatoria || Boolean(form.conta_id))
    && (!cartaoObrigatorio || Boolean(form.cartao_id));

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setAnalisandoIA(true);
    setErroIA('');

    try {
      const fd = new FormData();
      fd.append('task', 'analisar_recibo_futuramente');
      fd.append('foto', file);
      fd.append('provider', config.ai_modelo_ocr_padrao || 'automatico');
      fd.append('mode', (config.ai_modelo_ocr_padrao || 'automatico') !== 'automatico' ? 'manual' : 'auto');
      fd.append('financialProvider', config.ai_modelo_padrao || 'automatico');

      const res = await fetch('/api/ai', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.dados) {
        setForm((atual) => {
          const categoriaOCR = data.dados.categoria_id || atual.categoria_id;
          return {
            ...atual,
            descricao: data.dados.descricao || data.dados.estabelecimento || atual.descricao,
            valor: (data.dados.valor ?? data.dados.valor_total)?.toString() || atual.valor,
            categoria_id: categoriaOCR,
            data: data.dados.data || atual.data,
            horario: data.dados.horario || atual.horario,
            metodo_pagamento: categoriaOCR === 'feira_mantimentos'
              ? 'credito'
              : data.dados.metodo_pagamento || data.dados.forma_pagamento || atual.metodo_pagamento,
            parcelas: data.dados.parcelas?.toString() || atual.parcelas,
            local: data.dados.local || atual.local,
            conta_id: categoriaOCR === 'feira_mantimentos' ? '' : atual.conta_id,
          };
        });
        setItensCompraIA(Array.isArray(data.dados.itens_compra) ? data.dados.itens_compra : []);
      }
    } catch {
      setErroIA('Nao foi possivel analisar a imagem. Preencha manualmente.');
    } finally {
      setAnalisandoIA(false);
    }
  }

  function salvarTransacao() {
    const tipoAjustado = categoriaSelecionada?.tipo === 'transferencia' ? 'transferencia' : form.tipo;
    const metodoAjustado = tipoAjustado === 'transferencia' && form.metodo_pagamento === 'credito'
      ? 'pix'
      : form.metodo_pagamento;
    const cartaoAjustado = tipoAjustado === 'transferencia' ? undefined : (form.cartao_id || undefined);
    const contaAjustada = cartaoAjustado ? undefined : (form.conta_id || undefined);
    const dados = {
      descricao: form.descricao,
      valor: parseFloat(form.valor.replace(',', '.')),
      tipo: tipoAjustado,
      classificacao: form.classificacao,
      categoria_id: form.categoria_id,
      data: form.data,
      data_cobranca: form.tipo === 'despesa' ? (form.data_cobranca || form.data) : undefined,
      horario: form.horario || undefined,
      metodo_pagamento: metodoAjustado,
      parcelas: parseInt(form.parcelas, 10) || 1,
      parcela_atual: parseInt(form.parcela_atual, 10) || 0,
      local: form.local || undefined,
      observacoes: form.observacoes || undefined,
      origem: 'manual' as const,
      conta_id: contaAjustada,
      cartao_id: cartaoAjustado,
      itens_compra: itensCompraIA.length > 0 ? itensCompraIA : undefined,
    };

    if (transacaoEditar) {
      editarTransacao(transacaoEditar.id, dados);
    } else {
      adicionarTransacao(dados);
    }

    setSucesso(true);
    setTimeout(() => {
      setSucesso(false);
      onFechar();
    }, 800);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formularioValido) return;

    if (!transacaoEditar) {
      const duplicata = detectarDuplicata(
        {
          valor: parseFloat(form.valor.replace(',', '.')),
          categoria_id: form.categoria_id,
          data: form.data,
        },
        transacoes,
      );

      if (duplicata) {
        setDuplicataEncontrada(duplicata);
        return;
      }
    }

    salvarTransacao();
  }

  function handleExcluir() {
    if (!transacaoEditar) return;
    if (confirm('Excluir este lancamento?')) {
      excluirTransacao(transacaoEditar.id);
      onFechar();
    }
  }

  if (!aberto) return null;

  const opcoesClassificacao = form.tipo === 'despesa'
    ? [
        { valor: 'padrao', label: 'Gasto normal' },
        { valor: 'fixa', label: 'Gasto recorrente' },
        { valor: 'futura', label: 'Gasto futuro' },
      ]
    : form.tipo === 'receita'
    ? [
        { valor: 'padrao', label: 'Receita normal' },
        { valor: 'fixa', label: 'Receita recorrente' },
        { valor: 'futura', label: 'Receita futura' },
      ]
    : [
        { valor: 'padrao', label: 'Transferencia' },
      ];

  const parcelasNumericas = Math.max(parseInt(form.parcelas || '1', 10), 1);
  const parcelasLiquidadas = Math.max(Math.min(parseInt(form.parcela_atual || '0', 10), parcelasNumericas), 0);
  const parcelasRestantes = Math.max(parcelasNumericas - parcelasLiquidadas, 0);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />

        <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 lg:rounded-2xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-bold text-white">
              {transacaoEditar ? 'Editar transacao' : 'Nova transacao'}
            </h2>
            <button onClick={onFechar} className="rounded-lg p-1 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
          </div>

          {sucesso && (
            <div className="flex items-center justify-center gap-2 bg-emerald-900/30 p-4 text-emerald-400">
              <CheckCircle size={18} />
              <span className="text-sm font-medium">Transacao salva!</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            <div className="flex rounded-xl bg-slate-800 p-1">
              {(['despesa', 'receita', 'transferencia'] as TipoTransacao[]).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setForm((atual) => ({ ...atual, tipo, classificacao: 'padrao', categoria_id: '' }))}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                    form.tipo === tipo
                      ? tipo === 'despesa'
                        ? 'bg-red-600 text-white'
                        : tipo === 'receita'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tipo === 'despesa' ? 'Despesa' : tipo === 'receita' ? 'Receita' : 'Transfer.'}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">
                {form.tipo === 'despesa' ? 'Tipo de gasto' : form.tipo === 'receita' ? 'Tipo de receita' : 'Tipo'}
              </label>
              <div className="flex flex-wrap gap-2">
                {opcoesClassificacao.map((opcao) => (
                  <button
                    key={opcao.valor}
                    type="button"
                    onClick={() => setForm((atual) => ({ ...atual, classificacao: opcao.valor as ClassificacaoTransacao }))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      form.classificacao === opcao.valor
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {opcao.label}
                  </button>
                ))}
              </div>
            </div>

            {!transacaoEditar && (
              <div>
                <div className="mb-3">
                  <p className="mb-2 text-[11px] text-slate-500">Leitor OCR</p>
                  <OCRModelSelect
                    value={config.ai_modelo_ocr_padrao || 'automatico'}
                    onChange={(value) => atualizarConfig({ ai_modelo_ocr_padrao: value })}
                  />
                </div>
                <input
                  type="file"
                  ref={fileRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handleFoto}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={analisandoIA}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-purple-700 py-3 text-sm font-medium text-purple-400 transition-all hover:bg-purple-900/20"
                >
                  {analisandoIA ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <Brain size={16} />
                      IA analisando o comprovante...
                    </>
                  ) : (
                    <>
                      <Camera size={16} />
                      Fotografar comprovante
                    </>
                  )}
                </button>
                {erroIA && <p className="mt-1 text-xs text-red-400">{erroIA}</p>}
                {fotoPreview && !analisandoIA && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle size={12} />
                    Foto carregada, confira os campos abaixo
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-slate-400">Descricao *</label>
              <input
                type="text"
                placeholder="Ex: Mercado, aluguel, parcela do carro"
                value={form.descricao}
                onChange={(e) => setForm((atual) => ({ ...atual, descricao: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Valor da parcela (R$) *</label>
                <input
                  type="number"
                  placeholder="0,00"
                  value={form.valor}
                  onChange={(e) => setForm((atual) => ({ ...atual, valor: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
                  required
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Data da realizacao</label>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm((atual) => ({ ...atual, data: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {form.tipo === 'despesa' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Data de cobranca</label>
                  <input
                    type="date"
                    value={form.data_cobranca}
                    onChange={(e) => setForm((atual) => ({ ...atual, data_cobranca: e.target.value }))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
                  />
                </div>
                <div className="flex items-end">
                  <div className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-slate-400">
                    A despesa entra nas listas e previsoes pelo mes da cobranca.
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Horario</label>
                <input
                  type="time"
                  value={form.horario}
                  onChange={(e) => setForm((atual) => ({ ...atual, horario: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Regra da data</label>
                <div className="flex h-[42px] items-center rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs text-slate-400">
                  {form.classificacao === 'fixa'
                    ? 'Repete todo mes a partir desta data'
                    : form.classificacao === 'futura'
                    ? 'Entra apenas nesta data'
                    : 'Considera exatamente esta data'}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Categoria *</label>
              <div className="grid max-h-40 grid-cols-3 gap-2 overflow-y-auto pr-1">
                {categoriasFiltradas.map((categoria) => (
                  <button
                    key={categoria.id}
                    type="button"
                    onClick={() => setForm((atual) => ({
                      ...atual,
                      tipo: categoria.tipo,
                      categoria_id: categoria.id,
                      metodo_pagamento: categoria.id === 'feira_mantimentos'
                        ? 'credito'
                        : categoria.tipo === 'transferencia' && atual.metodo_pagamento === 'credito'
                        ? 'pix'
                        : atual.metodo_pagamento,
                      conta_id: categoria.id === 'feira_mantimentos' ? '' : atual.conta_id,
                      cartao_id: categoria.tipo === 'transferencia' ? '' : atual.cartao_id,
                    }))}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs transition-all ${
                      form.categoria_id === categoria.id
                        ? 'border-purple-500 bg-purple-600 text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">{categoria.icone}</span>
                    <span className="w-full truncate text-center text-[10px]">{categoria.nome}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Forma de pagamento</label>
              <div className="flex flex-wrap gap-2">
                {METODOS.map((metodo) => (
                  <button
                    key={metodo.valor}
                    type="button"
                    onClick={() => setForm((atual) => ({
                      ...atual,
                      metodo_pagamento: atual.tipo === 'transferencia' && metodo.valor === 'credito' ? 'pix' : metodo.valor,
                      conta_id: metodo.valor === 'credito' ? '' : atual.conta_id,
                      cartao_id: '',
                    }))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      form.metodo_pagamento === metodo.valor
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {metodo.icone} {metodo.label}
                  </button>
                ))}
              </div>
            </div>

            {mostrarContaSelector && contas.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Conta de origem</label>
                <div className="flex flex-wrap gap-2">
                  {contas.map((conta) => {
                    const info = BANCO_INFO[conta.banco];
                    const ativo = form.conta_id === conta.id;
                    return (
                      <button
                        key={conta.id}
                        type="button"
                        onClick={() => setForm((atual) => ({ ...atual, conta_id: ativo ? '' : conta.id }))}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                          ativo
                            ? 'border-purple-500/30 bg-purple-600/20 text-purple-300'
                            : 'border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200'
                        }`}
                      >
                        <BankLogo banco={conta.banco} size={20} className="h-5 w-5 object-contain" />
                        {info.nome} · {conta.tipo}
                      </button>
                    );
                  })}
                </div>
                {!form.conta_id && (
                  <p className="mt-1 text-[11px] text-amber-400">Selecione uma conta para continuar.</p>
                )}
              </div>
            )}

            {mostrarCartaoSelector && cartoes.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Cartao de credito</label>
                <div className="flex flex-wrap gap-2">
                  {cartoes.map((cartao) => {
                    const ativo = form.cartao_id === cartao.id;
                    return (
                      <button
                        key={cartao.id}
                        type="button"
                        onClick={() => setForm((atual) => ({ ...atual, cartao_id: ativo ? '' : cartao.id }))}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                          ativo
                            ? 'border-purple-500/30 bg-purple-600/20 text-purple-300'
                            : 'border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200'
                        }`}
                      >
                        <BankLogo banco={cartao.banco} size={20} className="mt-0.5 h-5 w-5 object-contain" />
                        <span className="flex flex-col items-start">
                          <span>{cartao.nome}</span>
                          <span className={`mt-0.5 text-[10px] ${ativo ? 'text-purple-400/70' : 'text-slate-600'}`}>
                            Fatura: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartao.fatura_atual)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!form.cartao_id && (
                  <p className="mt-1 text-[11px] text-amber-400">Selecione um cartao para continuar.</p>
                )}
              </div>
            )}

            {form.tipo === 'despesa' && !usaControleDeSerie && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Parcelamento</label>
                  <select
                    value={form.parcelas}
                    onChange={(e) => setForm((atual) => ({ ...atual, parcelas: e.target.value, parcela_atual: '0' }))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
                  >
                    {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
                {parcelasNumericas > 1 && form.valor && (
                  <div className="flex items-end pb-2.5">
                    <div>
                      <div className="text-xs text-slate-500">Total previsto</div>
                      <div className="text-sm font-semibold text-purple-400">
                        {formatarMoeda(parseFloat(form.valor || '0') * parcelasNumericas)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {usaControleDeSerie && (
              <div className="space-y-3 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      {form.tipo === 'receita' ? 'Total de parcelas a receber' : 'Total de parcelas'}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form.parcelas}
                      onChange={(e) => setForm((atual) => ({ ...atual, parcelas: e.target.value }))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      {form.tipo === 'receita' ? 'Parcelas ja recebidas' : 'Parcelas pagas'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={parcelasNumericas}
                      value={form.parcela_atual}
                      onChange={(e) => setForm((atual) => ({ ...atual, parcela_atual: e.target.value }))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
                {form.valor && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-slate-900/60 px-3 py-2">
                      <div className="text-slate-500">Total do contrato</div>
                      <div className="mt-1 font-semibold text-purple-300">
                        {formatarMoeda(parseFloat(form.valor || '0') * parcelasNumericas)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-900/60 px-3 py-2">
                      <div className="text-slate-500">{form.tipo === 'receita' ? 'Ainda vai receber' : 'Ainda vai pagar'}</div>
                      <div className="mt-1 font-semibold text-amber-300">
                        {formatarMoeda(parseFloat(form.valor || '0') * parcelasRestantes)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-slate-400">Local (opcional)</label>
              <input
                type="text"
                placeholder="Ex: Rio Branco-AC"
                value={form.local}
                onChange={(e) => setForm((atual) => ({ ...atual, local: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-400">Observacoes</label>
              <textarea
                rows={3}
                placeholder="Anote detalhes importantes sobre este lancamento"
                value={form.observacoes}
                onChange={(e) => setForm((atual) => ({ ...atual, observacoes: e.target.value }))}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex gap-3">
              {transacaoEditar && (
                <button
                  type="button"
                  onClick={handleExcluir}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-semibold text-red-300 transition-all hover:bg-red-500/20"
                >
                  <Trash2 size={16} />
                  Excluir
                </button>
              )}
              <button
                type="submit"
                disabled={sucesso || !formularioValido}
                className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white transition-all hover:bg-purple-500 active:scale-95 disabled:bg-purple-900 disabled:text-purple-700"
              >
                {sucesso ? 'Salvo!' : transacaoEditar ? 'Salvar alteracoes' : 'Lancar transacao'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {duplicataEncontrada && (
        <ModalDuplicata
          transacaoExistente={duplicataEncontrada}
          onConfirmar={() => {
            setDuplicataEncontrada(null);
            salvarTransacao();
          }}
          onCancelar={() => setDuplicataEncontrada(null)}
        />
      )}
    </>
  );
}
